@echo off
cd /d "%~dp0"
set PYTHONUNBUFFERED=1
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
"C:\Data\python\python.exe" -u server.py >> "C:\Users\hahha\Desktop\.openclaw\campus-rpg-web\backend\server.log" 2>&1
