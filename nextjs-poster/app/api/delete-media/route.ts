import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { del } from '@vercel/blob';

export const maxDuration = 60;

async function handler(request: Request) {
  try {
    const body = await request.json();
    const { videoUrl, productId } = body;

    console.log(`Executing delayed cleanup for Blob: ${videoUrl}`);
    if (videoUrl) {
      await del(videoUrl);
    }

    if (productId) {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        
        await supabase.from('auto_products').update({ 
           downloaded_video_path: null,
           downloaded_image_path: null
        }).eq('id', productId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete media error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function rawHandler(request: Request) {
  return handler(request);
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY 
  ? verifySignatureAppRouter(handler)
  : rawHandler;
