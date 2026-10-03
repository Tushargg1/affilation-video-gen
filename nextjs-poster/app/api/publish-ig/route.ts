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
           
       } else {
           console.error('Instagram Publish Error:', igData);
       }
    }

    // Update Database
    if (body.productId) {
        try {
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
            await supabase.from('auto_products').update({ 
               is_posted: true, 
               instagram_link: postLinks.instagram 
            }).eq('id', body.productId);
        } catch (e) {
            console.error("Failed to update Supabase with IG link:", e);
        }
    }

    // Clean up Blob now that all platforms are done
    console.log('Cleaning up Vercel Blob...');
    await del(videoUrl);

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
