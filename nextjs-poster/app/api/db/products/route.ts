import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('auto_products')
      .select('*')
      .order('id', { ascending: false })
      .limit(3000);
      
    if (error) return NextResponse.json({ error: error.message, isDatabaseError: true }, { status: 500 });
    return NextResponse.json({ products: data });
  } catch (err: any) {
    const isPaused = String(err?.message || '').includes('fetch failed') || String(err?.message || '').includes('ENOTFOUND');
    return NextResponse.json({ 
      error: isPaused ? 'Database is paused by Supabase. Please resume it in the Supabase Dashboard.' : (err?.message || 'Database connection error'),
      isPaused,
      products: [] 
    }, { status: 503 });
  }
}
