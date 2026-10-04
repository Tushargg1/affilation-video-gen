import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { id, image_prompt, video_prompt, model_photo_url, video_url, image_url } = await req.json();

    if (!id) return NextResponse.json({ error: 'Missing product ID' }, { status: 400 });

    const updates: any = {};
    if (image_prompt !== undefined) updates.image_prompt = image_prompt;
    if (video_prompt !== undefined) updates.video_prompt = video_prompt;
    if (model_photo_url !== undefined) updates.model_photo_url = model_photo_url;
    if (video_url !== undefined) updates.video_url = video_url;
    if (image_url !== undefined) updates.image_url = image_url;
    
    // Always track when the prompt was last updated
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('auto_products')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, product: data[0] });
  } catch (error: any) {
    console.error('Update product prompt error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
