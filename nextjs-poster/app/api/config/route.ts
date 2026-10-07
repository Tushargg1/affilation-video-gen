import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export const dynamic = 'force-dynamic';

const defaultConfig = {
  scheduler_enabled: true,
  prompt_generation_enabled: true,
  daily_target: 4,
  schedule_times: ['02:00', '06:00', '09:00', '19:00'],
  base_image_prompt: 'You are an expert AI prompt engineer. Analyze the attached product image and write a highly detailed, professional text-to-image prompt to generate a stunning, cinematic, and photorealistic showcase of this product.\\nPlace the product in an aesthetic, premium environment that matches its vibe (e.g., a sleek studio, a cozy lifestyle setting, etc.).\\nInclude keywords like: 8k resolution, cinematic lighting, ultra-detailed, photorealistic, professional photography.\\nReturn ONLY the final prompt text, with no introductory text or markdown formatting.',
  base_video_prompt: "You are an expert AI prompt engineer. Analyze the attached product image and write a highly detailed text-to-video prompt to create a stunning, high-converting product showcase video.\\nThe video must be exactly 10 seconds long.\\nFocus on smooth, premium camera movements (e.g., slow cinematic pan, dynamic orbital shot, or elegant zoom).\\nDescribe the lighting as professional and cinematic. Highlight the product's textures and aesthetic appeal.\\nInclude keywords like: exactly 10 seconds, smooth 60fps motion, cinematic product showcase, highly detailed.\\nReturn ONLY the final prompt text, with no introductory text or markdown formatting.",
  youtube_title_template: 'Trending {category} #shorts',
  youtube_caption: 'Trending {category} ✨\n\nGet it here: {url}\n\n#trending #shorts',
  facebook_caption: '🔥 Hot New Product Alert! 🔥\n\nThis beautiful {category} is now available.\n\nComment "DRESS" and I will automatically DM you the exact Meesho link and price right now! 👇\n\nGrab yours today: {url}',
  instagram_caption: 'Obsessed with this {category}! 😍\n\nComment "DRESS" and I will automatically DM you the exact Meesho link and price right now! 👇\n\nLink in bio to shop!\n\n#fashion #trending #musthave',
  facebook_image_caption: '✨ Check out this gorgeous {category}!\n\nComment "DRESS" and I will automatically DM you the exact Meesho link and price right now! 👇\n\nGet it here: {url}',
  instagram_image_caption: '😍 Loving this {category}!\n\nComment "DRESS" and I will automatically DM you the exact Meesho link and price right now! 👇\n\nLink in bio to shop! #fashion #trending #ootd'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET() {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return NextResponse.json(defaultConfig, { headers: corsHeaders });
    }

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const config = await redis.get('app:scheduler_config');
    if (!config) {
      return NextResponse.json(defaultConfig, { headers: corsHeaders });
    }

    let mergedConfig = { ...defaultConfig, ...(typeof config === 'string' ? JSON.parse(config) : config) };
    
    // One-time migration: If they have {title} in the DB, forcefully overwrite with the new category defaults
    if (!mergedConfig.migrated_to_category_v2 || mergedConfig.youtube_title_template?.includes('{title}')) {
      mergedConfig.youtube_title_template = defaultConfig.youtube_title_template;
      mergedConfig.youtube_caption = defaultConfig.youtube_caption;
      mergedConfig.facebook_caption = defaultConfig.facebook_caption;
      mergedConfig.instagram_caption = defaultConfig.instagram_caption;
      mergedConfig.facebook_image_caption = defaultConfig.facebook_image_caption;
      mergedConfig.instagram_image_caption = defaultConfig.instagram_image_caption;
      mergedConfig.migrated_to_category_v2 = true;
      
      try {
        await redis.set('app:scheduler_config', mergedConfig);
      } catch(e) {} // ignore if it fails
    }

    return NextResponse.json(mergedConfig, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(defaultConfig, { headers: corsHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
       return NextResponse.json({ error: 'Redis credentials missing' }, { status: 500, headers: corsHeaders });
    }

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    let current = await redis.get('app:scheduler_config');
    if (typeof current === 'string') current = JSON.parse(current);
    
    const newConfig = { ...defaultConfig, ...(current as any || {}), ...body };
    await redis.set('app:scheduler_config', newConfig);
    
    // Synchronize QStash CRON schedules based on the new posting times
    if (process.env.QSTASH_TOKEN) {
      try {
        const { Client } = require('@upstash/qstash');
        const qstash = new Client({ token: process.env.QSTASH_TOKEN });
        
        const existingSchedules = await qstash.schedules.list();
        for (const schedule of existingSchedules) {
           await qstash.schedules.delete(schedule.scheduleId);
        }

        if (newConfig.scheduler_enabled && newConfig.schedule_times) {
          const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
          const host = request.headers.get('host') || process.env.VERCEL_PROJECT_PRODUCTION_URL || '';
          if (host) {
            const targetUrl = `${protocol}://${host}/api/cron/post-next`;
            for (const timeStr of newConfig.schedule_times) {
               const [hh, mm] = timeStr.split(':').map(Number);
               // Convert IST (UTC+5:30) to UTC for QStash Cron
               let totalMins = hh * 60 + mm - 330;
               if (totalMins < 0) totalMins += 24 * 60;
               const utcHh = Math.floor(totalMins / 60);
               const utcMm = totalMins % 60;
               const cronStr = `${utcMm} ${utcHh} * * *`;
               
               await qstash.schedules.create({
                  destination: targetUrl,
                  cron: cronStr,
               });
            }
          }
        }
      } catch (qstashErr: any) {
        console.error("Failed to sync QStash schedules:", qstashErr);
      }
    }
    
    return NextResponse.json({ success: true, config: newConfig }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
}
