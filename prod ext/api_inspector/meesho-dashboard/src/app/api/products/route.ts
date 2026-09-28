import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const script = `import sqlite3, json, sys, os; sys.stdout.reconfigure(encoding='utf-8'); db_path = r'c:\\Users\\tusha\\OneDrive\\Desktop\\affilation video gen\\prod ext\\api_inspector\\data\\meesho_products.db'; conn = sqlite3.connect(db_path); cursor = conn.cursor(); cursor.execute('SELECT * FROM auto_products ORDER BY id DESC LIMIT 50'); columns = [desc[0] for desc in cursor.description]; print(json.dumps([dict(zip(columns, row)) for row in cursor.fetchall()]))`;
    
    const { stdout } = await execAsync(`python -c "${script}"`);
    let products = JSON.parse(stdout);
    products = products.map((p: any) => {
      if (p.created_at && !p.created_at.endsWith('Z')) p.created_at += 'Z';
      return p;
    });
    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json({ products: [] });
  }
}
