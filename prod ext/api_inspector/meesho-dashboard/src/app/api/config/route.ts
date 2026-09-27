import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), '../data/scheduler_config.json');

const defaultConfig = {
  scheduler_enabled: true,
  daily_target: 4,
  schedule_times: ['02:00', '06:00', '09:00', '19:00']
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET() {
  try {
    if (!fs.existsSync(configPath)) {
      if (!fs.existsSync(path.dirname(configPath))) fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      return NextResponse.json(defaultConfig, { headers: corsHeaders });
    }
    const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(defaultConfig, { headers: corsHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!fs.existsSync(path.dirname(configPath))) fs.mkdirSync(path.dirname(configPath), { recursive: true });
    
    let current = { ...defaultConfig };
    if (fs.existsSync(configPath)) {
        try { current = { ...current, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) }; } catch (e) {}
    }
    const newConfig = { ...current, ...body };
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    
    return NextResponse.json({ success: true, config: newConfig }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
}
