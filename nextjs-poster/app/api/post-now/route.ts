import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@upstash/qstash';
import { Redis } from '@upstash/redis';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find the first product that has a video generated but has NOT been posted yet
    const { data: products, error } = await supabase
      .from('auto_products')
      .select('id, title, downloaded_video_path, downloaded_image_path, product_url')
      .eq('is_posted', false)
      .not('downloaded_video_path', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'No pending products found with a generated video.' }, { status: 404 });
    }

    const product = products[0];

    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const host = request.headers.get('host') || process.env.VERCEL_PROJECT_PRODUCTION_URL || '';

    if (!host) {
      return NextResponse.json({ error: 'Could not determine host URL.' }, { status: 500 });
    }

    // Store a history entry in Redis
    let messageId = `manual_${Date.now()}`;
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
      await redis.hset('app:posts', {
        [messageId]: {
          id: messageId,
          blobName: `product_${product.id}.mp4`,
          platforms: ['youtube', 'facebook', 'instagram'],
          scheduleTime: new Date().toISOString(),
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        }
      });
    }

    // Dispatch to QStash to run the actual posting in the background (avoids timeout)
    const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
    await qstash.publishJSON({
      url: `${protocol}://${host}/api/post`,
      body: {
        videoUrl: product.downloaded_video_path,
        imageUrl: product.downloaded_image_path,
        blobName: `product_${product.id}.mp4`,
        productId: product.id,
        description: product.title,
        platforms: ['youtube', 'facebook', 'instagram'],
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: `Dispatched posting for "${product.title}"`,
      productId: product.id,
      videoUrl: product.downloaded_video_path,
      imageUrl: product.downloaded_image_path,
    });

  } catch (error: any) {
    console.error('Post Now error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
