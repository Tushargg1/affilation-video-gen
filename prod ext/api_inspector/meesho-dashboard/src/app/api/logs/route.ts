import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const logPath = path.join(process.cwd(), '../data/automation.log');
    if (!fs.existsSync(logPath)) {
      return NextResponse.json({ logs: 'Awaiting automation start...', metrics: { appRestarts: 0, deviceBoots: 0, issues: [] } });
    }
    const logs = fs.readFileSync(logPath, 'utf-8');
    
    // Parse metrics
    const deviceBoots = (logs.match(/Launching Android Studio emulator/g) || []).length;
    const appRestarts = (logs.match(/Force-restarting Meesho|force-stop.*com.meesho.supply/g) || []).length;
    const stuckIssues = (logs.match(/Stuck or too many scrolls/g) || []).length;
    
    let issues = [];
    if (stuckIssues > 0) issues.push(`Stuck/Feed Depleted (${stuckIssues} times)`);
    
    return NextResponse.json({ 
      logs, 
      metrics: { appRestarts, deviceBoots, issues } 
    });
  } catch (error) {
    return NextResponse.json({ logs: 'Error reading logs.' });
  }
}
