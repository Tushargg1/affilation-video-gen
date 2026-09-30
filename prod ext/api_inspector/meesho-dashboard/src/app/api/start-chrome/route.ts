import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

export async function POST(request: Request) {
  try {
    const logPath = path.join(process.cwd(), '../data/automation.log');
    if (!fs.existsSync(path.dirname(logPath))) {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
    }
    fs.appendFileSync(logPath, '[Auto-Start] Starting Chrome extraction (secondary_scraper.js)...\n');

    const scriptPath = path.join(process.cwd(), '../../../../video gen');
    const child = spawn('node', ['secondary_scraper.js'], {
      cwd: scriptPath,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.unref();

    return NextResponse.json({ message: 'Chrome extraction started!' });
  } catch (error: any) {
    return NextResponse.json({ error: `Failed to start: ${error.message}` }, { status: 500 });
  }
}
