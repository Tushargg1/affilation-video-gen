import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const ADB = `C:\\Users\\tusha\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe`;
const EMULATOR = `C:\\Users\\tusha\\AppData\\Local\\Android\\Sdk\\emulator\\emulator.exe`;

async function isPythonRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const script = `import psutil; r=any('meesho_full_auto' in ' '.join(p.info.get('cmdline') or []) and 'psutil' not in ' '.join(p.info.get('cmdline') or []) for p in psutil.process_iter(['cmdline'])); print(r)`;
    const child = spawn('python', ['-c', script]);
    let out = '';
    child.stdout.on('data', d => out += d.toString());
    child.on('close', () => resolve(out.trim() === 'True'));
    child.on('error', () => resolve(false));
  });
}

async function isEmulatorRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(ADB, ['devices']);
    let out = '';
    child.stdout.on('data', d => out += d.toString());
    child.on('close', () => resolve(out.includes('emulator-5554') && out.includes('device')));
    child.on('error', () => resolve(false));
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const keyword = body.keyword || 'mens lowers';
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

    // STEP 1: Auto-launch Android Studio Pixel 8 emulator if not running
    const emuRunning = await isEmulatorRunning();
    if (!emuRunning) {
      fs.appendFileSync(logPath, '[Auto-Start] Pixel 8 emulator not running. Launching Android Studio emulator...\n');
      const emuProcess = spawn(EMULATOR, ['-avd', 'Pixel_8', '-no-snapshot-load'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      emuProcess.unref();
      fs.appendFileSync(logPath, '[Auto-Start] Emulator launched! Waiting 45 seconds to initialize...\n');
      await new Promise(r => setTimeout(r, 45000));
    } else {
      fs.appendFileSync(logPath, '[Auto-Start] Pixel 8 emulator already running. Skipping launch.\n');
    }

    // STEP 2: Spawn the Python automation script (detached)
    const scriptPath = path.join(process.cwd(), '..');
    fs.appendFileSync(logPath, `[Auto-Start] Starting meesho_full_auto.py with keyword="${keyword}", skipZero=${skipZeroArg}...\n`);

    const child = spawn('python', ['meesho_full_auto.py', keyword, skipZeroArg], {
      cwd: scriptPath,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.unref();

    return NextResponse.json({ message: 'Full automation pipeline started!' });
  } catch (error: any) {
    return NextResponse.json({ error: `Failed to start: ${error.message}` }, { status: 500 });
  }
}
