import subprocess as sp
import time
import sys
sys.path.insert(0, '.')
from meesho_emulator_collector import AdbClient

dev = AdbClient('127.0.0.1:5915')

# Check if BlueStacks is already running via ADB
try:
    result = dev.shell('echo', 'alive', timeout=3)
    if 'alive' in result:
        print('BlueStacks ADB already connected! Bringing to front...')
    else:
        raise Exception('No alive signal')
except Exception as e:
    print(f'ADB not connected ({e}). Launching BlueStacks...')
    sp.Popen([r'C:\Program Files\BlueStacks_nxt\HD-Player.exe', '--instance', 'Tiramisu64_36'])
    print('Waiting up to 40s for BlueStacks to boot...')
    for i in range(40):
        time.sleep(1)
        try:
            if 'alive' in dev.shell('echo', 'alive', timeout=2):
                print(f'BlueStacks is UP after {i+1}s!')
                time.sleep(5)
                break
        except:
            pass
    else:
        print('ERROR: BlueStacks failed to start in 40 seconds!')
        sys.exit(1)

# Bring BlueStacks window to front
print('Bringing BlueStacks to foreground...')
sp.run(['powershell', '-command',
    "(New-Object -ComObject WScript.Shell).AppActivate('BlueStacks App Player')"],
    capture_output=True)

time.sleep(1)

# Force-stop and open Meesho
print('Force stopping Meesho...')
dev.shell('am', 'force-stop', 'com.meesho.supply')
time.sleep(2)

print('Launching Meesho...')
dev.shell('monkey', '-p', 'com.meesho.supply', '-c', 'android.intent.category.LAUNCHER', '1')
time.sleep(4)

print('SUCCESS: Meesho should now be visible and open in BlueStacks!')
