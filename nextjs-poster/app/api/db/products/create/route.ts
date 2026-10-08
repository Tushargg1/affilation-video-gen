import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { title, social_link_2, downloaded_video_path } = await request.json();
    
    const { data, error } = await supabase
      .from('auto_products')
      .insert([{ 
        title: title || 'Temp Video', 
        downloaded_video_path: downloaded_video_path || social_link_2,
        is_posted: false
      }])
      .select()
      .single();
      
    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
