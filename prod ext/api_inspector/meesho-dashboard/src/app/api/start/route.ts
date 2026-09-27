import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

async function isPythonRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`python -c "import psutil; r=any('meesho_full_auto' in ' '.join(p.info.get('cmdline') or []) and 'psutil' not in ' '.join(p.info.get('cmdline') or []) for p in psutil.process_iter(['cmdline'])); print(r)"`);
    return stdout.trim() === 'True';
  } catch {
    return false;
  }
}

async function isBlueStacksRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`python -c "import psutil; r=any('hd-player' in (p.info.get('name') or '').lower() for p in psutil.process_iter(['name'])); print(r)"`);
    return stdout.trim() === 'True';
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const keyword = body.keyword || 'kurti';
    const skipZeroArg = body.skipZero ? 'skip_zero' : 'allow_zero';

    // Check if already running
    const alreadyRunning = await isPythonRunning();
    if (alreadyRunning) {
      return NextResponse.json({ message: 'Automation is already running!' }, { status: 400 });
    }

    // Clear log file on new start
    const logPath = path.join(process.cwd(), '../data/automation.log');
    if (!fs.existsSync(path.dirname(logPath))) {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
    }
    fs.writeFileSync(logPath, '[Auto-Start] Starting full automation pipeline...\n');

    // STEP 1: Auto-launch BlueStacks if not running
    const bsRunning = await isBlueStacksRunning();
    if (!bsRunning) {
      fs.appendFileSync(logPath, '[Auto-Start] BlueStacks not running. Launching BlueStacks...\n');
      const bsScript = `
import subprocess
try:
    subprocess.Popen([r"C:\\Program Files\\BlueStacks_nxt\\HD-Player.exe", "--instance", "Pie64"])
    print("BlueStacks launched")
except Exception as e:
    print("Error:", e)
`.trim().replace(/\n/g, '; ');
      try {
        await execAsync(`python -c "${bsScript}"`);
        fs.appendFileSync(logPath, '[Auto-Start] BlueStacks launched! Waiting 35 seconds for it to initialize...\n');
        // Wait 35 seconds for BlueStacks to fully boot
        await new Promise(r => setTimeout(r, 35000));
      } catch (bsErr) {
        fs.appendFileSync(logPath, `[Auto-Start] Warning: Could not launch BlueStacks: ${bsErr}\n`);
      }
    } else {
      fs.appendFileSync(logPath, '[Auto-Start] BlueStacks already running. Skipping launch.\n');
    }

    // STEP 2: Spawn the Python automation script (detached so it survives server restarts and page refreshes)
    const scriptPath = path.join(process.cwd(), '..');
    fs.appendFileSync(logPath, `[Auto-Start] Starting meesho_full_auto.py with keyword="${keyword}", skipZero=${skipZeroArg}...\n`);
    
    const { spawn } = require('child_process');
    const child = spawn('python', ['meesho_full_auto.py', keyword, skipZeroArg], {
      cwd: scriptPath,
      detached: true,
      stdio: 'ignore', // Must ignore stdio to fully detach on Windows
      windowsHide: true,
    });

    child.unref();

    return NextResponse.json({ message: 'Full automation pipeline started!' });
  } catch (error: any) {
    return NextResponse.json({ error: `Failed to start: ${error.message}` }, { status: 500 });
  }
}
