import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { ids } = await request.json();
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }
    
    // Fetch URLs of blobs to delete
    const { data: products } = await supabase
      .from('auto_products')
      .select('downloaded_image_path, downloaded_video_path')
      .in('id', ids);

    // Delete Blobs
    if (products && products.length > 0) {
      const urlsToDelete: string[] = [];
      products.forEach(p => {
        if (p.downloaded_image_path && p.downloaded_image_path.includes('vercel-storage.com')) {
          urlsToDelete.push(p.downloaded_image_path);
        }
        if (p.downloaded_video_path && p.downloaded_video_path.includes('vercel-storage.com')) {
          urlsToDelete.push(p.downloaded_video_path);
        }
      });
      if (urlsToDelete.length > 0) {
        try {
          // Dynamic import of del just in case, but standard import at top is better
          const { del } = await import('@vercel/blob');
          await del(urlsToDelete);
        } catch (e) {
          console.error('Failed to delete blobs', e);
        }
      }
    }

    const { error } = await supabase
      .from('auto_products')
      .delete()
      .in('id', ids);
      
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
