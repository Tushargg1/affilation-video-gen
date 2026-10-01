import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10000,
});

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request: Request) {
  let client;
  try {
    const { ids } = await request.json();
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }
    client = await pool.connect();
    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(', ');
    const result = await client.query(
      `DELETE FROM auto_products WHERE id IN (${placeholders})`,
      ids
    );
    return NextResponse.json({ deleted: result.rowCount ?? 0 });
  } catch (error: any) {
    console.error('Delete error:', error?.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    client?.release();
  }
}
