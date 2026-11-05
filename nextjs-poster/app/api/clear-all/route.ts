import { list, del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    // 1. Delete all blobs
    let deletedBlobs = 0;
    const { blobs } = await list();
    for (const blob of blobs) {
      await del(blob.url);
      deletedBlobs++;
    }

    // 2. Clear media paths in Supabase
    const { data: products, error: getError } = await supabase
      .from('auto_products')
      .select('id, downloaded_video_path, downloaded_image_path');
      
    if (getError) throw getError;

    let updatedProducts = 0;
    for (const p of products) {
      if (p.downloaded_video_path || p.downloaded_image_path) {
        await supabase
          .from('auto_products')
          .update({ downloaded_video_path: null, downloaded_image_path: null, video_created: 0 })
          .eq('id', p.id);
        updatedProducts++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Cleared ${deletedBlobs} blobs and ${updatedProducts} database rows.` 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
