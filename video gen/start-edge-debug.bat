@echo off
echo Closing all Edge instances...
taskkill /F /IM msedge.exe 2>nul
timeout /t 2 /nobreak >nul

echo Starting Edge with remote debugging...
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Microsoft\Edge\User Data"

echo.
echo Edge is now running with remote debugging enabled!
echo You can now run the automation script: node digen-connect.js
echo.
pause
