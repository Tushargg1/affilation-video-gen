"""
start_emu.py  --  Launch Android Studio Pixel 8 emulator and wait for boot.
"""
import subprocess
import time
import sys

EMULATOR = r"C:\Users\tusha\AppData\Local\Android\Sdk\emulator\emulator.exe"
ADB      = r"C:\Users\tusha\AppData\Local\Android\Sdk\platform-tools\adb.exe"
SERIAL   = "emulator-5554"

def is_emulator_ready():
    try:
        out = subprocess.check_output([ADB, "-s", SERIAL, "shell", "getprop", "sys.boot_completed"],
                                       stderr=subprocess.STDOUT, timeout=5)
        return out.strip() == b"1"
    except Exception:
        return False

def launch_pixel8():
    print("Launching Android Studio Pixel 8 emulator (AVD: Pixel_8)...")
    proc = subprocess.Popen(
        [EMULATOR, "-avd", "Pixel_8", "-no-snapshot-load"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"Emulator process started (PID {proc.pid}). Waiting for boot...")
    for i in range(90):  # up to 3 minutes
        time.sleep(2)
        if is_emulator_ready():
            print("EMULATOR IS RUNNING AND BOOTED!")
            return True
        if i % 10 == 0:
            print(f"  Still booting... ({i*2}s elapsed)")
    print("EMULATOR FAILED TO BOOT within 3 minutes!")
    return False

if __name__ == "__main__":
    # If already up, don't relaunch
    if is_emulator_ready():
        print("EMULATOR IS ALREADY RUNNING!")
        sys.exit(0)
    success = launch_pixel8()
    sys.exit(0 if success else 1)
