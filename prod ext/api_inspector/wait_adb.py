import subprocess
import time

ADB = r"C:\Users\tusha\AppData\Local\Android\Sdk\platform-tools\adb.exe"

print("Waiting for Android Studio Pixel 8 emulator (emulator-5554)...")
while True:
    try:
        out = subprocess.check_output([ADB, "-s", "emulator-5554", "shell", "echo", "alive"], stderr=subprocess.STDOUT)
        if b"alive" in out:
            print("ADB emulator-5554 is ready!")
            break
    except Exception:
        pass
    time.sleep(2)
