import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

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

export async function GET() {
  try {
    const script = `
import psutil, json
running_auto = False
running_emu = False
for p in psutil.process_iter(['cmdline', 'name', 'exe']):
    try:
        cmd = ' '.join(p.info.get('cmdline') or [])
        name = (p.info.get('name') or '').lower()
        exe = (p.info.get('exe') or '').lower()
        if 'meesho_full_auto' in cmd and 'psutil' not in cmd:
            running_auto = True
        if 'emulator' in name and ('qemu' in name or 'emulator' in exe or 'android' in exe):
            running_emu = True
        if 'qemu-system' in name:
            running_emu = True
    except Exception:
        pass
print(json.dumps({'isRunning': running_auto, 'isBlueStacksRunning': running_emu}))
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
