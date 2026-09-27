import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST() {
  // Write big STOP message to log
  const logPath = path.join(process.cwd(), '../data/automation.log');
  if (fs.existsSync(logPath)) {
    const stopMsg = `\n\n==================================================\n🛑 AUTOMATION STOPPING\nCLOSING MEESHO, BLUESTACKS, AND SCRAPER SCRIPTS...\n==================================================\n\n`;
    fs.appendFileSync(logPath, stopMsg);
  }

  // Kill Python scraper
  const killScript = path.join(process.cwd(), 'scripts', 'kill.py');
  exec(`python "${killScript}"`);
  
  // Kill BlueStacks (this automatically closes Meesho)
  exec('taskkill /F /IM HD-Player.exe');

  // Note: NOT killing Next.js or Cloudflare so the Vercel UI remains functional for the next Start.
  return NextResponse.json({ message: 'Automation and BlueStacks are stopping...' });
}
