import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { id, video_created } = await request.json();
    const val = video_created ? 1 : 0;
    
    const script = `import sqlite3; conn = sqlite3.connect('../data/meesho_products.db'); conn.execute('UPDATE auto_products SET video_created = ? WHERE id = ?', (${val}, ${id})); conn.commit()`;
    await execAsync(`python -c "${script}"`);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
