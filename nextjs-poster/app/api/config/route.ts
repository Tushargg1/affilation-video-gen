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
  youtube_caption: 'Check out this amazing {title}! 🚀\n\nGet it here: {url}\n\n#trending #shorts',
  facebook_caption: '🔥 Hot New Product Alert! 🔥\n\n{title} is now available.\n\nGrab yours today: {url}',
  instagram_caption: 'Obsessed with this {title}! 😍\n\nLink in bio to shop!\n\n#fashion #trending #musthave'
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

    return NextResponse.json(config, { headers: corsHeaders });
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

    let current = await redis.get('app:scheduler_config') || defaultConfig;
    if (typeof current === 'string') current = JSON.parse(current);
    
    const newConfig = { ...(current as any), ...body };
    await redis.set('app:scheduler_config', newConfig);
    
    return NextResponse.json({ success: true, config: newConfig }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
}
