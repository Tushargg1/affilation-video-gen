@echo off
title Meesho Automation Launcher
echo ===================================================
echo     Meesho Automation Dashboard Launcher
echo ===================================================
echo.
echo Starting Next.js Local Server...
cd meesho-dashboard
start "Next.js Server (Do not close)" cmd /c "npm run dev -- -p 3333"

echo Waiting 5 seconds for the server to initialize...
timeout /t 5 /nobreak >nul

echo.
echo Starting Cloudflare Tunnel and opening Vercel App...
echo ===================================================
echo Keep this window open! It links Vercel to your PC.
echo ===================================================
echo.
python ..\launcher.py
pause
