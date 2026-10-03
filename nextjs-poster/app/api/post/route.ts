import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { del } from '@vercel/blob';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';

export const maxDuration = 60;

async function handler(request: Request) {
  try {
    const body = await request.json();
    let { videoUrl, imageUrl, blobName, description, platforms, productId } = body;
    const pId = productId || (blobName ? blobName.split('_')[1] : null);
    
    // Upstash sends the original messageId in the headers
    const messageId = request.headers.get('upstash-message-id');

    console.log(`Webhook triggered for video: ${blobName}`);

    // Fetch the video data from Vercel Blob into memory
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) throw new Error('Failed to download video from Vercel Blob');
    const videoArrayBuffer = await videoResponse.arrayBuffer();
    const videoBuffer = Buffer.from(videoArrayBuffer);
    
    // Fetch config and product data for platform-specific captions
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    let config: any = {};
    if (process.env.UPSTASH_REDIS_REST_URL) {
      const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
      config = await redis.get('app:scheduler_config') || {};
    }

    let title = "Amazing Product";
    let url = "";

    try {
      if (pId) {
        const { data } = await supabase.from('auto_products').select('title, product_url').eq('id', pId).single();
        if (data) {
          title = data.title;
          url = data.product_url;
        }
      }
    } catch(e) {
      console.error("Failed to fetch product data from Supabase:", e);
    }

    const replaceVars = (str: string) => (str || '').replace(/{title}/g, title).replace(/{url}/g, url);

    // Video captions
    const ytCaption = replaceVars(config.youtube_caption || "Check this out! {url} #shorts");
    const fbCaption = replaceVars(config.facebook_caption || "Hot new product! {url}");
    const igCaption = replaceVars(config.instagram_caption || "Link in bio to shop this {title}!");

    // Image captions (separate from video captions)
    const fbImageCaption = replaceVars(config.facebook_image_caption || "✨ Check out this gorgeous product! {title}\n\nGet it here: {url}");
    const igImageCaption = replaceVars(config.instagram_image_caption || "😍 Loving this {title}!\n\nLink in bio to shop! #fashion #trending #ootd");

    const postLinks: any = {};

    // 1. Upload VIDEO to YouTube
    if (platforms.includes('youtube') && process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN) {
        console.log('Uploading video to YouTube...');
        const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
        oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        
        const stream = new Readable();
        stream.push(videoBuffer);
        stream.push(null);

        const ytRes = await youtube.videos.insert({
          part: ['snippet', 'status'],
          requestBody: { snippet: { title: `${title} #shorts`, description: ytCaption, categoryId: '22' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } },
          media: { body: stream },
        });
        
        if (ytRes.data.id) {
          postLinks.youtube = `https://youtu.be/${ytRes.data.id}`;
        }
    }

    // 2. Upload VIDEO to Facebook
    if (platforms.includes('facebook') && process.env.FACEBOOK_PAGE_ID && process.env.META_ACCESS_TOKEN) {
        console.log('Uploading video to Facebook...');
        const fbUrl = `https://graph.facebook.com/v20.0/${process.env.FACEBOOK_PAGE_ID}/videos`;
        const formData = new FormData();
        formData.append('description', fbCaption);
        formData.append('access_token', process.env.META_ACCESS_TOKEN);
        formData.append('source', new Blob([videoBuffer], { type: 'video/mp4' }), blobName);
        const fbRes = await fetch(fbUrl, { method: 'POST', body: formData });
        const fbData = await fbRes.json();
        
        if (fbData.id) {
          postLinks.facebook = `https://www.facebook.com/video.php?v=${fbData.id}`;
        }
    }

    // 3. Post IMAGE to Facebook (separate photo post after video)
    if (imageUrl && platforms.includes('facebook') && process.env.FACEBOOK_PAGE_ID && process.env.META_ACCESS_TOKEN) {
        console.log('Posting image to Facebook...');
        const fbPhotoUrl = `https://graph.facebook.com/v20.0/${process.env.FACEBOOK_PAGE_ID}/photos`;
        const fbImgFormData = new FormData();
        fbImgFormData.append('caption', fbImageCaption);
        fbImgFormData.append('access_token', process.env.META_ACCESS_TOKEN);
        fbImgFormData.append('url', imageUrl); // Use URL method to avoid downloading the image
        const fbImgRes = await fetch(fbPhotoUrl, { method: 'POST', body: fbImgFormData });
        const fbImgData = await fbImgRes.json();
        if (fbImgData.id) {
          console.log('Facebook image post success:', fbImgData.id);
          // Store image post link (separate from video)
          postLinks.facebook_image = `https://www.facebook.com/photo.php?fbid=${fbImgData.id}`;
        } else {
          console.error('Facebook image post error:', fbImgData);
        }
    }

    // 4. Instagram VIDEO Step 1 (Container Creation)
    let isIgDelayed = false;
    if (platforms.includes('instagram') && process.env.INSTAGRAM_ACCOUNT_ID && process.env.META_ACCESS_TOKEN) {
       console.log('Creating Instagram Video Container...');
       const igUrl = `https://graph.facebook.com/v20.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media?media_type=REELS&video_url=${encodeURIComponent(videoUrl)}&caption=${encodeURIComponent(igCaption)}&access_token=${process.env.META_ACCESS_TOKEN}`;
       const igRes = await fetch(igUrl, { method: 'POST' });
       const igData = await igRes.json();
       
       if (igData.id) {
         // Schedule Step 2 via QStash (IG needs 2 min processing)
         const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
         const host = request.headers.get('host') || process.env.VERCEL_PROJECT_PRODUCTION_URL;
         const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
         await qstash.publishJSON({
            url: `${protocol}://${host}/api/publish-ig`,
            body: { containerId: igData.id, videoUrl, messageId, postLinks, productId: pId, imageUrl, igImageCaption },
            delay: 120, // Wait 2 minutes for IG to process the video
         });
         isIgDelayed = true;
       } else {
         console.error('Instagram Container Error:', igData);
       }
    }

    // 5. Cleanup and Status Update
    if (!isIgDelayed) {
       console.log('Scheduling Vercel Blob cleanup in 48 hours...');
       const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
       const host = request.headers.get('host') || process.env.VERCEL_PROJECT_PRODUCTION_URL;
       const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
       await qstash.publishJSON({
          url: `${protocol}://${host}/api/delete-media`,
          body: { videoUrl, productId: pId },
          delay: 48 * 60 * 60, // 48 hours
       });
       
       if (messageId && process.env.UPSTASH_REDIS_REST_URL) {
         const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
         const existing = await redis.hget('app:posts', messageId);
         if (existing) {
           await redis.hset('app:posts', { [messageId]: { ...(existing as any), status: 'POSTED', links: { ...((existing as any).links || {}), ...postLinks } } });
         }
       }
    } else {
       if (messageId && process.env.UPSTASH_REDIS_REST_URL) {
         const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
         const existing = await redis.hget('app:posts', messageId);
         if (existing) {
           await redis.hset('app:posts', { [messageId]: { ...(existing as any), status: 'IG_PROCESSING', links: { ...((existing as any).links || {}), ...postLinks } } });
         }
       }
    }

    try {
      if (pId) {
         const categoryLinks = {
           facebook_link: postLinks.facebook || '',
           facebook_image_link: postLinks.facebook_image || '',
           youtube_link: postLinks.youtube || '',
         };
         const updatePayload: any = { 
           is_posted: true,
           category: JSON.stringify(categoryLinks)
         };
         await supabase.from('auto_products').update(updatePayload).eq('id', pId);
      }
    } catch (e) {
      console.error("Failed to update Supabase with post links:", e);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function rawHandler(request: Request) {
  return handler(request);
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : rawHandler;


export const maxDuration = 60;

async function handler(request: Request) {
  try {
    const body = await request.json();
    let { videoUrl, blobName, description, platforms, productId } = body;
    const pId = productId || (blobName ? blobName.split('_')[1] : null);
    
    // Upstash sends the original messageId in the headers
    const messageId = request.headers.get('upstash-message-id');

    console.log(`Webhook triggered for video: ${blobName}`);

    // Fetch the video data from Vercel Blob into memory
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) throw new Error('Failed to download video from Vercel Blob');
    const videoArrayBuffer = await videoResponse.arrayBuffer();
    const videoBuffer = Buffer.from(videoArrayBuffer);
    
    // Fetch config and product data for platform-specific captions
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    let config: any = {};
    if (process.env.UPSTASH_REDIS_REST_URL) {
      const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
      config = await redis.get('app:scheduler_config') || {};
    }

    let title = "Amazing Product";
    let url = "";

    try {
      if (pId) {
        const { data } = await supabase.from('auto_products').select('title, product_url').eq('id', pId).single();
        if (data) {
          title = data.title;
          url = data.product_url;
        }
      }
    } catch(e) {
      console.error("Failed to fetch product data from Supabase:", e);
    }

    const replaceVars = (str: string) => (str || '').replace(/{title}/g, title).replace(/{url}/g, url);

    const ytCaption = replaceVars(config.youtube_caption || "Check this out! {url} #shorts");
    const fbCaption = replaceVars(config.facebook_caption || "Hot new product! {url}");
    const igCaption = replaceVars(config.instagram_caption || "Link in bio to shop this {title}!");

    const postLinks: any = {};

    // 2. Upload to YouTube
    if (platforms.includes('youtube') && process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN) {
        console.log('Uploading to YouTube...');
        const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
        oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        
        const stream = new Readable();
        stream.push(videoBuffer);
        stream.push(null);

        const ytRes = await youtube.videos.insert({
          part: ['snippet', 'status'],
          requestBody: { snippet: { title: `Short - ${blobName}`, description: ytCaption, categoryId: '22' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } },
          media: { body: stream },
        });
        
        if (ytRes.data.id) {
          postLinks.youtube = `https://youtu.be/${ytRes.data.id}`;
        }
    }

    // 3. Upload to Facebook
    if (platforms.includes('facebook') && process.env.FACEBOOK_PAGE_ID && process.env.META_ACCESS_TOKEN) {
        console.log('Uploading to Facebook...');
        const fbUrl = `https://graph.facebook.com/v20.0/${process.env.FACEBOOK_PAGE_ID}/videos`;
        const formData = new FormData();
        formData.append('description', fbCaption);
        formData.append('access_token', process.env.META_ACCESS_TOKEN);
        formData.append('source', new Blob([videoBuffer], { type: 'video/mp4' }), blobName);
        const fbRes = await fetch(fbUrl, { method: 'POST', body: formData });
        const fbData = await fbRes.json();
        
        if (fbData.id) {
          postLinks.facebook = `https://www.facebook.com/video.php?v=${fbData.id}`;
        }
    }

    // 4. Instagram Step 1 (Container Creation)
    let isIgDelayed = false;
    if (platforms.includes('instagram') && process.env.INSTAGRAM_ACCOUNT_ID && process.env.META_ACCESS_TOKEN) {
       console.log('Creating Instagram Container...');
       const igUrl = `https://graph.facebook.com/v20.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media?media_type=REELS&video_url=${encodeURIComponent(videoUrl)}&caption=${encodeURIComponent(igCaption)}&access_token=${process.env.META_ACCESS_TOKEN}`;
       const igRes = await fetch(igUrl, { method: 'POST' });
       const igData = await igRes.json();
       
       if (igData.id) {
         // Schedule Step 2
         const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
         const host = request.headers.get('host') || process.env.VERCEL_PROJECT_PRODUCTION_URL;
         const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
         await qstash.publishJSON({
            url: `${protocol}://${host}/api/publish-ig`,
            body: { containerId: igData.id, videoUrl, messageId, postLinks, productId: pId },
            delay: 120, // Wait 2 minutes for IG to process the video
         });
         isIgDelayed = true;
       } else {
         console.error('Instagram Container Error:', igData);
       }
    }

    // 5. Cleanup and Status Update
    if (!isIgDelayed) {
       console.log('Scheduling Vercel Blob cleanup in 48 hours...');
       const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
       const host = request.headers.get('host') || process.env.VERCEL_PROJECT_PRODUCTION_URL;
       const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
       await qstash.publishJSON({
          url: `${protocol}://${host}/api/delete-media`,
          body: { videoUrl, productId: pId },
          delay: 48 * 60 * 60, // 48 hours
       });
       
       if (messageId && process.env.UPSTASH_REDIS_REST_URL) {
         const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
         const existing = await redis.hget('app:posts', messageId);
         if (existing) {
           await redis.hset('app:posts', { [messageId]: { ...(existing as any), status: 'POSTED', links: { ...((existing as any).links || {}), ...postLinks } } });
         }
       }
    } else {
       if (messageId && process.env.UPSTASH_REDIS_REST_URL) {
         const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
         const existing = await redis.hget('app:posts', messageId);
         if (existing) {
           await redis.hset('app:posts', { [messageId]: { ...(existing as any), status: 'IG_PROCESSING', links: { ...((existing as any).links || {}), ...postLinks } } });
         }
       }
    }

    try {
      if (pId) {
         const categoryLinks = {
           facebook_link: postLinks.facebook || '',
           youtube_link: postLinks.youtube || '',
         };
         const updatePayload: any = { 
           is_posted: true,
           category: JSON.stringify(categoryLinks)
         };
         await supabase.from('auto_products').update(updatePayload).eq('id', pId);
      }
    } catch (e) {
      console.error("Failed to update Supabase with post links:", e);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function rawHandler(request: Request) {
  return handler(request);
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : rawHandler;
