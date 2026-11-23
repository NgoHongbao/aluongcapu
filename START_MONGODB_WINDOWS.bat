@echo off
chcp 65001 >nul
cd /d "%~dp0"
setlocal
set "PYTHON_EXE=.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"
if not defined MONGODB_URI (
  set "MONGODB_URI=mongodb://127.0.0.1:27028"
  powershell -NoProfile -Command "$mongo = Get-ChildItem -Path .mongo-runtime/*/bin/mongod.exe -ErrorAction SilentlyContinue | Select-Object -First 1; if ($mongo -and -not (Get-NetTCPConnection -State Listen -LocalPort 27028 -ErrorAction SilentlyContinue)) { New-Item -ItemType Directory -Force .mongo-runtime/db | Out-Null; Start-Process -FilePath $mongo.FullName -ArgumentList '--dbpath .mongo-runtime/db --bind_ip 127.0.0.1 --port 27028 --logpath .mongo-runtime/mongo.log --setParameter diagnosticDataCollectionEnabled=false' -WindowStyle Hidden }"
)
if not defined MONGODB_DB set "MONGODB_DB=our_little_universe"
if not defined DATA_DIR set "DATA_DIR=data/mongo"
if not defined HOST set "HOST=0.0.0.0"
if not defined PORT set "PORT=8001"
echo Web local: http://127.0.0.1:%PORT%
echo Dien thoai cung Wi-Fi: http://IPv4-cua-may:%PORT%
"%PYTHON_EXE%" -m uvicorn server:app --host "%HOST%" --port "%PORT%"
pause
