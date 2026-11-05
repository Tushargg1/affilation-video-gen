@echo off
title AI Influencer 50s Reel Automation
color 0b

echo ========================================================
echo   AI Influencer 50s Reel Video Generator & Auto-Poster
echo ========================================================
echo.
echo Starting Local Automation Bridge Server (Port 3001)...
start "AI Automation Bridge Server" cmd /k "cd /d %~dp0 && node server.js"

timeout /t 3 >nul

echo Starting Autonomous Daily Influencer Scheduler...
start "AI Influencer Scheduler" cmd /k "cd /d %~dp0 && node influencer_scheduler.js"

echo.
echo ========================================================
echo Both Server and Influencer Scheduler are now active!
echo Video Gen workflow runs through your browser extension.
echo 5 clips (10s each) will be generated, merged to 50s,
echo and auto-posted daily at the configured time.
echo ========================================================
pause
