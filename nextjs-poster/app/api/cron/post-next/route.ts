import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // 1. Check if scheduling is enabled
    const configData = await redis.get('app:scheduler_config');
    const config = typeof configData === 'string' ? JSON.parse(configData) : (configData || {});
    
    if (config.scheduler_enabled === false) {
      return NextResponse.json({ skipped: true, reason: 'Scheduler is disabled in settings' });
    }

    // 2. Fetch history to avoid re-scheduling pending posts
    const histData = await redis.hgetall('app:posts') || {};
    const scheduledIds = Object.values(histData)
      .filter((p: any) => p.status === 'PENDING' || p.status === 'POSTED' || p.status === 'IG_PROCESSING' || p.status === 'PARTIAL_SUCCESS')
      .map((p: any) => p.productId)
      .filter(Boolean);

    // 3. Fetch oldest unposted video
    let query = supabase
      .from('auto_products')
      .select('*')
      .not('downloaded_video_path', 'is', null)
      .eq('is_posted', false)
      .order('id', { ascending: true }) // Oldest first
      .limit(50);
      
    const { data: candidates, error } = await query;
    
    if (error) {
      throw new Error(error.message);
    }
    
    // Find the first candidate that is not already scheduled
    const product = (candidates || []).find((p: any) => !scheduledIds.includes(p.id));

    if (!product) {
      return NextResponse.json({ skipped: true, reason: 'No unposted videos available in the queue' });
    }

    // 4. Schedule it immediately
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const host = request.headers.get('host') || process.env.VERCEL_PROJECT_PRODUCTION_URL || '';
    
    const scheduleRes = await fetch(`${protocol}://${host}/api/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrl: product.downloaded_video_path,
        imageUrl: product.downloaded_image_path,
        productId: product.id,
        platforms: ['youtube', 'facebook', 'instagram'],
        scheduleTime: new Date().toISOString(), // Immediate
        blobName: `video_${product.id}_${Date.now()}.mp4`
      })
    });

    if (!scheduleRes.ok) {
       const err = await scheduleRes.text();
       throw new Error(`Failed to schedule: ${err}`);
    }

    return NextResponse.json({ success: true, productScheduled: product.id, title: product.title });
  } catch (error: any) {
    console.error('CRON post-next failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
