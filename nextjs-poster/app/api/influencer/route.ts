import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lgzqxzfepgfatdseiwxh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET() {
  try {
    const { data: reels, error } = await supabase
      .from('influencer_reels')
      .select('*')
      .order('id', { ascending: false })
      .limit(50);

    const todayStr = new Date().toISOString().split('T')[0];
    const todaysReel = reels ? reels.find((r: any) => r.target_date === todayStr) : null;

    return NextResponse.json({
      success: true,
      todaysReel,
      reels: reels || []
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, reels: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'trigger_generation') {
      // Send command to local server or trigger pipeline
      const localRes = await fetch('http://localhost:3001/api/influencer/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customTopic: body.customTopic })
      }).catch(() => null);

      if (localRes && localRes.ok) {
        return NextResponse.json({ success: true, message: 'Reel generation triggered on local laptop server' });
      } else {
        return NextResponse.json({
          success: false,
          error: 'Local automation server is not reachable on http://localhost:3001. Please run "start-influencer-automation.bat" on your laptop.'
        }, { status: 503 });
      }
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
