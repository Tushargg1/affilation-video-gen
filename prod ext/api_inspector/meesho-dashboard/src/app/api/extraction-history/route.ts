import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10000,
});

export async function GET() {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      'SELECT * FROM extraction_sessions ORDER BY id DESC LIMIT 50'
    );
    return NextResponse.json({ sessions: result.rows });
  } catch (error: any) {
    console.error('Extraction history error:', error?.message);
    return NextResponse.json({ sessions: [] });
  } finally {
    client?.release();
  }
}
