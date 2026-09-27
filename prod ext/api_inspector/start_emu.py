import sys
sys.path.insert(0, r'c:\Users\tusha\OneDrive\Desktop\affilation video gen\prod ext\api_inspector')
from meesho_full_auto import ensure_bluestacks_running
if ensure_bluestacks_running():
    print("EMULATOR IS RUNNING!")
else:
    print("EMULATOR FAILED TO START!")
