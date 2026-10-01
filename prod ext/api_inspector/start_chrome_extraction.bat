@echo off
title Chrome Product Extractor
echo ===================================================
echo    Meesho Chrome Product Extractor
echo    Auto-extracts: image, name, price, rating, reviews
echo ===================================================
echo.

:: Kill any stale instances first
echo Cleaning up old processes...
taskkill /F /IM undetected_chromedriver.exe /T >nul 2>&1
taskkill /F /IM python.exe /T >nul 2>&1
ping -n 2 127.0.0.1 >nul

echo.
echo Starting extraction daemon...
echo (Chrome will open automatically - do not close it!)
echo.
cd /d "%~dp0"
python enrich_products.py
echo.
echo Daemon stopped. Press any key to exit.
pause > nul
