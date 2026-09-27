@echo off
echo =====================================================
echo Starting Edge with Remote Debugging for Automation
echo =====================================================
echo.
echo INSTRUCTIONS:
echo 1. Edge will open with a debugging port enabled
echo 2. Go to digen.ai and log in (if not already)
echo 3. Leave Edge open and run: node connect-to-edge.js
echo.
echo Starting Edge...
echo.

REM Start Edge with remote debugging on port 9222
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 "https://digen.ai/en/explore"

echo.
echo Edge is running with remote debugging enabled!
echo Now run: node connect-to-edge.js
echo.
pause
