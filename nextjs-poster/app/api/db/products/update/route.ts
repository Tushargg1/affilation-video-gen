import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, video_created, is_posted, is_affiliated } = body;
    
    const updatePayload: any = {};
    if (video_created !== undefined) updatePayload.video_created = video_created ? 1 : 0;
    if (is_posted !== undefined) updatePayload.is_posted = is_posted;
    if (is_affiliated !== undefined) updatePayload.is_affiliated = is_affiliated;
    
    const { error } = await supabase
      .from('auto_products')
      .update(updatePayload)
      .eq('id', id);
      
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
