@echo off
chcp 65001 >nul
cd /d "%~dp0"
title A Luong & CaPu - Our Little Universe
if exist ".venv\Scripts\python.exe" (
  set "PYCMD=.venv\Scripts\python.exe"
  goto startup
)
where py >nul 2>&1
if %errorlevel%==0 (
  set "PYCMD=py"
) else (
  set "PYCMD=python"
)
:startup
echo.
echo ============================================
echo      A LUONG  ^<3  CAPU - OUR UNIVERSE
echo ============================================
echo.
echo [1/2] Cai dat thu vien can thiet...
%PYCMD% -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo LOI: Chua cai Python hoac khong the cai thu vien.
  echo Cai Python 3.10+ va bat Add Python to PATH.
  pause
  exit /b 1
)
echo.
echo [2/2] Mo website: http://127.0.0.1:8000
echo Giu cua so nay mo khi su dung website.
echo.
%PYCMD% server.py
pause
