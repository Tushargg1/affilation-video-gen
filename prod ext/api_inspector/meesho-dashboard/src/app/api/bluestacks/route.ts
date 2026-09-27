import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST() {
  try {
    const emulatorExe = `C:\\Users\\tusha\\AppData\\Local\\Android\\Sdk\\emulator\\emulator.exe`;
    const child = spawn(emulatorExe, ['-avd', 'Pixel_8', '-no-snapshot-load'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return NextResponse.json({ message: 'Android Studio Pixel 8 emulator starting...' });
  } catch (error: any) {
    return NextResponse.json({ message: `Failed to start emulator: ${error.message}` }, { status: 500 });
  }
}
