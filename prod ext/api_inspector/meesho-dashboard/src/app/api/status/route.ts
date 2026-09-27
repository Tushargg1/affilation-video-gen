import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

import { spawn } from 'child_process';

export async function GET() {
  try {
    const script = `
import psutil, json
running_auto = False
running_bs = False
for p in psutil.process_iter(['cmdline', 'name']):
    try:
        cmd = ' '.join(p.info.get('cmdline') or [])
        name = (p.info.get('name') or '').lower()
        if 'meesho_full_auto' in cmd and 'psutil' not in cmd:
            running_auto = True
        if 'hd-player' in name or 'bluestacks' in name:
            running_bs = True
    except Exception:
        pass
print(json.dumps({'isRunning': running_auto, 'isBlueStacksRunning': running_bs}))
`;
    
    const data = await new Promise((resolve, reject) => {
      const child = spawn('python', ['-']);
      let stdout = '';
      child.stdout.on('data', d => stdout += d.toString());
      child.on('close', code => {
        if (code !== 0) reject(new Error('Python failed'));
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
      });
      child.on('error', reject);
      child.stdin.write(script);
      child.stdin.end();
    });
    
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ isRunning: false, isBlueStacksRunning: false });
  }
}
