import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { del } from '@vercel/blob';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Readable } from 'stream';
import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';

export const maxDuration = 60;

async function handler(request: Request) {
  try {
    const body = await request.json();
    let { videoUrl, blobName, description, platforms } = body;
    
    // Upstash sends the original messageId in the headers
    const messageId = request.headers.get('upstash-message-id');

    console.log(`Webhook triggered for video: ${blobName}`);

    // Fetch the video data from Vercel Blob into memory
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) throw new Error('Failed to download video from Vercel Blob');
    const videoArrayBuffer = await videoResponse.arrayBuffer();
    const videoBuffer = Buffer.from(videoArrayBuffer);
    
    // 1. AI Caption Generation
    if (!description || description.trim() === '') {
      if (process.env.GEMINI_API_KEY) {
        console.log('Generating AI caption...');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        const prompt = "Watch this video and write an engaging, viral social media caption with 3-5 trending hashtags. Do not include quotes.";
        
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: videoBuffer.toString("base64"), mimeType: "video/mp4" } }
        ]);
        description = result.response.text().trim();
      } else {
        description = "Check out this new video! 🔥 #viral";
      }
    }

    let postLinks: any = {};

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
          requestBody: { snippet: { title: `Short - ${blobName}`, description, categoryId: '22' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } },
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
        formData.append('description', description);
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
       const igUrl = `https://graph.facebook.com/v20.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media?media_type=REELS&video_url=${encodeURIComponent(videoUrl)}&caption=${encodeURIComponent(description)}&access_token=${process.env.META_ACCESS_TOKEN}`;
       const igRes = await fetch(igUrl, { method: 'POST' });
       const igData = await igRes.json();
       
       if (igData.id) {
         // Schedule Step 2
         const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
         const host = request.headers.get('host') || process.env.VERCEL_PROJECT_PRODUCTION_URL;
         const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
         await qstash.publishJSON({
            url: `${protocol}://${host}/api/publish-ig`,
            body: { containerId: igData.id, videoUrl, messageId, postLinks },
            delay: 120, // Wait 2 minutes for IG to process the video
         });
         isIgDelayed = true;
       } else {
         console.error('Instagram Container Error:', igData);
       }
    }

    // 5. Cleanup and Status Update
    if (!isIgDelayed) {
       console.log('Cleaning up Vercel Blob...');
       await del(videoUrl);
       
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
