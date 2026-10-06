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
    
    // 1. Fetch URLs to delete blobs
    const selectResult = await client.query(
      `SELECT downloaded_image_path, downloaded_video_path FROM auto_products WHERE id IN (${placeholders})`,
      ids
    );
    
    // 2. Delete Blobs
    const urlsToDelete: string[] = [];
    selectResult.rows.forEach((row: any) => {
      if (row.downloaded_image_path && row.downloaded_image_path.includes('vercel-storage.com')) {
        urlsToDelete.push(row.downloaded_image_path);
      }
      if (row.downloaded_video_path && row.downloaded_video_path.includes('vercel-storage.com')) {
        urlsToDelete.push(row.downloaded_video_path);
      }
    });
    
    if (urlsToDelete.length > 0) {
      try {
        const { del } = await import('@vercel/blob');
        await del(urlsToDelete);
      } catch (e) {
        console.error('Failed to delete blobs:', e);
      }
    }

    // 3. Delete the product
    const result = await client.query(
      `DELETE FROM auto_products WHERE id IN (${placeholders})`,
      ids
    );
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    return NextResponse.json({ deleted: result.rowCount ?? 0 }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('Delete error:', error?.message);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  } finally {
    client?.release();
  }
}
