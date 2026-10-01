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
    const result = await client.query(`
      SELECT id, title, price, commission_percent, product_url,
             image_url, review_star, total_bought, video_created, created_at
      FROM auto_products
      ORDER BY id DESC
      LIMIT 100
    `);
    const products = result.rows.map((p: any) => ({
      ...p,
      // Filter out FAILED placeholder
      image_url: p.image_url === 'FAILED' ? null : p.image_url,
      created_at: p.created_at ? String(p.created_at) : null,
    }));
    return NextResponse.json({ products });
  } catch (error: any) {
    console.error('Products API error:', error?.message);
    return NextResponse.json({ products: [] });
  } finally {
    client?.release();
  }
}
