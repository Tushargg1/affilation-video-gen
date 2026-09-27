import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST() {
  try {
    const script = `
import subprocess
try:
    subprocess.Popen([r"C:\\Program Files\\BlueStacks_nxt\\HD-Player.exe", "--instance", "Pie64"])
except Exception as e:
    print("Error:", e)
`;
    await execAsync(`python -c "${script.trim().replace(/\n/g, '; ')}"`);
    return NextResponse.json({ message: 'BlueStacks starting...' });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to start BlueStacks' }, { status: 500 });
  }
}
