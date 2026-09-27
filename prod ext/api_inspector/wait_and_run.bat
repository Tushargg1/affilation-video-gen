@echo off
set ADB="C:\Program Files\BlueStacks_nxt\HD-Adb.exe"
:loop
%ADB% -s 127.0.0.1:5915 shell echo alive >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo ADB READY
    goto :run
)
ping -n 3 127.0.0.1 >nul
goto :loop

:run
echo Starting automation...
cd /d "c:\Users\tusha\OneDrive\Desktop\affilation video gen\prod ext\api_inspector"
python meesho_full_auto.py "mens lowers" allow_zero > data\run.log 2>&1
