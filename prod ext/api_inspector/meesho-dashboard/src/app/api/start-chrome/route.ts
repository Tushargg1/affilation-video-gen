import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';

let enrichmentProcess: ReturnType<typeof spawn> | null = null;

export async function GET() {
  return NextResponse.json({ running: enrichmentProcess !== null && enrichmentProcess.exitCode === null });
}

export async function POST() {
  try {
    // Kill any existing instances to avoid Chrome Profile lock conflicts
    // Using taskkill instead of wmic because wmic is deprecated on newer Windows 11 builds
    try {
      execSync('taskkill /F /IM undetected_chromedriver.exe /T', { stdio: 'ignore' });
    } catch (e) {}
    
    // Attempt to copy the user's real Chrome cookies to bypass Akamai
    // This will gracefully fail if Chrome is open, but will succeed if Chrome is closed.
    try {
      const srcCookies = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data', 'Profile 2', 'Network', 'Cookies');
      const destProfile = path.join(process.env.USERPROFILE || '', '.meesho_uc_profile', 'Default', 'Network');
      if (!fs.existsSync(destProfile)) {
        fs.mkdirSync(destProfile, { recursive: true });
      }
      if (fs.existsSync(srcCookies)) {
        fs.copyFileSync(srcCookies, path.join(destProfile, 'Cookies'));
        console.log("Successfully synced cookies for Akamai bypass");
      }
    } catch (e) {
      console.log("Cookie sync skipped (file locked by Chrome). Existing cookies will be used.");
    }

    const logPath = path.join(process.cwd(), '../data/automation.log');
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const scriptPath = path.join(process.cwd(), '../enrich_products.py');
    fs.appendFileSync(logPath, `[Chrome Enrichment] Starting enrich_products.py at ${new Date().toLocaleString()}...\n`);

    enrichmentProcess = spawn('python', [scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    enrichmentProcess.unref();

    return NextResponse.json({ message: 'Chrome extraction (enrichment) started!' });
  } catch (error: any) {
    return NextResponse.json({ error: `Failed to start: ${error.message}` }, { status: 500 });
  }
}
