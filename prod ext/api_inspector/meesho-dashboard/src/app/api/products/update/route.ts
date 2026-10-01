import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10000,
});

export async function POST(request: Request) {
  let client;
  try {
    const { id, video_created } = await request.json();
    const val = video_created ? 1 : 0;
    client = await pool.connect();
    await client.query(
      'UPDATE auto_products SET video_created = $1 WHERE id = $2',
      [val, id]
    );
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update error:', error?.message);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  } finally {
    client?.release();
  }
}
