import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { del } from '@vercel/blob';
import { Redis } from '@upstash/redis';

export const maxDuration = 60;

async function handler(request: Request) {
  try {
    const body = await request.json();
    const { containerId, videoUrl, messageId, postLinks = {} } = body;

    console.log(`Publishing IG Container: ${containerId}`);

    if (process.env.INSTAGRAM_ACCOUNT_ID && process.env.META_ACCESS_TOKEN) {
       const igUrl = `https://graph.facebook.com/v20.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media_publish?creation_id=${containerId}&access_token=${process.env.META_ACCESS_TOKEN}`;
       const igRes = await fetch(igUrl, { method: 'POST' });
       const igData = await igRes.json();
       
       if (igData.id) {
           console.log('Instagram Publish Success:', igData.id);
           
           // Fetch the permalink
           try {
               const permalinkRes = await fetch(`https://graph.facebook.com/v20.0/${igData.id}?fields=permalink&access_token=${process.env.META_ACCESS_TOKEN}`);
               const permalinkData = await permalinkRes.json();
               if (permalinkData.permalink) {
                   postLinks.instagram = permalinkData.permalink;
               } else {
                   postLinks.instagram = `https://www.instagram.com/p/${igData.id}/`; // Fallback
               }
           } catch (err) {}

           // Publish IG Photo
           if (body.imageUrl) {
               try {
                   console.log('Posting image to Instagram...');
                   const igPhotoUrl = `https://graph.facebook.com/v20.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media?image_url=${encodeURIComponent(body.imageUrl)}&caption=${encodeURIComponent(body.igImageCaption || '')}&access_token=${process.env.META_ACCESS_TOKEN}`;
                   const igPhotoRes = await fetch(igPhotoUrl, { method: 'POST' });
                   const igPhotoData = await igPhotoRes.json();
                   
                   if (igPhotoData.id) {
                       // Publish the photo container immediately (images usually process instantly)
                       const igPhotoPublishUrl = `https://graph.facebook.com/v20.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media_publish?creation_id=${igPhotoData.id}&access_token=${process.env.META_ACCESS_TOKEN}`;
                       const igPhotoPublishRes = await fetch(igPhotoPublishUrl, { method: 'POST' });
                       const igPhotoPublishData = await igPhotoPublishRes.json();
                       
                       if (igPhotoPublishData.id) {
                           console.log('Instagram Image Post Success:', igPhotoPublishData.id);
                           try {
                               const permalinkRes = await fetch(`https://graph.facebook.com/v20.0/${igPhotoPublishData.id}?fields=permalink&access_token=${process.env.META_ACCESS_TOKEN}`);
                               const permalinkData = await permalinkRes.json();
                               if (permalinkData.permalink) {
                                   postLinks.instagram_image = permalinkData.permalink;
                               }
                           } catch (err) {}
                       }
                   }
               } catch (e) {
                   console.error('Instagram Image Publish Error:', e);
               }
           }

           // Update Database only when IG actually succeeded
           if (body.productId) {
               try {
                   const { createClient } = require('@supabase/supabase-js');
                   const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
                   
                   const { data } = await supabase.from('auto_products').select('category').eq('id', body.productId).single();
                   let links: any = {};
                   if (data && data.category) {
                     try { links = JSON.parse(data.category); } catch(e) {}
                   }
                   links.instagram_link = postLinks.instagram || '';
                   links.instagram_image_link = postLinks.instagram_image || '';
                   
                   await supabase.from('auto_products').update({ 
                      is_posted: true, 
                      category: JSON.stringify(links)
                   }).eq('id', body.productId);
               } catch (e) {
                   console.error("Failed to update Supabase with IG link:", e);
               }
           }
           
       } else {
           console.error('Instagram Publish Error:', igData);
       }
    }

    // Clean up Blob in 48 hours
    console.log('Scheduling Vercel Blob cleanup in 48 hours...');
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const host = request.headers.get('host') || process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const { Client } = require('@upstash/qstash');
    const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
    await qstash.publishJSON({
       url: `${protocol}://${host}/api/delete-media`,
       body: { videoUrl, productId: body.productId },
       delay: 48 * 60 * 60, // 48 hours
    });

    // Update History Database
    if (messageId && process.env.UPSTASH_REDIS_REST_URL) {
        const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
        const existing = await redis.hget('app:posts', messageId);
        if (existing) {
          await redis.hset('app:posts', { [messageId]: { ...(existing as any), status: 'POSTED', links: { ...((existing as any).links || {}), ...postLinks } } });
        }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('IG Publish error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function rawHandler(request: Request) {
  return handler(request);
}

// Use signature verification only if signing keys are available (avoids build errors)
export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY 
  ? verifySignatureAppRouter(handler)
  : rawHandler;
