import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST() {
  // Write big STOP message to log
  const logPath = path.join(process.cwd(), '../data/automation.log');
  if (fs.existsSync(logPath)) {
    const stopMsg = `\n\n==================================================\n🛑 AUTOMATION STOPPING\nCLOSING MEESHO AND SCRAPER SCRIPTS...\n==================================================\n\n`;
    fs.appendFileSync(logPath, stopMsg);
  }

  // Kill Python scraper only (keep Pixel 8 Emulator running for fast restarts)
  const killScript = path.join(process.cwd(), 'scripts', 'kill.py');
  exec(`python "${killScript}"`);
  
  // Note: NOT killing Pixel 8 Emulator, Next.js, or Cloudflare so the next Start is instant.
  return NextResponse.json({ message: 'Automation stopped. Pixel 8 Emulator kept running for quick restart.' });
}
