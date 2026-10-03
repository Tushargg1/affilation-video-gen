import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, video_created, is_posted, is_affiliated, social_link_1, social_link_2, facebook_link, instagram_link, youtube_link } = body;
    
    const updatePayload: any = {};
    if (video_created !== undefined) updatePayload.video_created = video_created ? 1 : 0;
    if (is_posted !== undefined) updatePayload.is_posted = is_posted;
    if (is_affiliated !== undefined) updatePayload.is_affiliated = is_affiliated;
    if (social_link_1 !== undefined) updatePayload.downloaded_image_path = social_link_1;
    if (social_link_2 !== undefined) updatePayload.downloaded_video_path = social_link_2;
    if (facebook_link !== undefined) updatePayload.facebook_link = facebook_link;
    if (instagram_link !== undefined) updatePayload.instagram_link = instagram_link;
    if (youtube_link !== undefined) updatePayload.youtube_link = youtube_link;
    
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
