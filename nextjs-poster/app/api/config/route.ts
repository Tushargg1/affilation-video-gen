import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export const dynamic = 'force-dynamic';

const defaultConfig = {
  scheduler_enabled: true,
  daily_target: 4,
  schedule_times: ['02:00', '06:00', '09:00', '19:00']
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
