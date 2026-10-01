import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

let enrichmentProcess: ReturnType<typeof spawn> | null = null;

export async function GET() {
  return NextResponse.json({ running: enrichmentProcess !== null && enrichmentProcess.exitCode === null });
}

export async function POST() {
  try {
    // Don't start a second instance if already running
    if (enrichmentProcess && enrichmentProcess.exitCode === null) {
      return NextResponse.json({ message: 'Enrichment already running!' });
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
