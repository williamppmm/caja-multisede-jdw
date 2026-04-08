@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo No se encontro el entorno local.
  echo Ejecute primero "Instalar Caja.bat".
  echo.
  pause
  exit /b 1
)

".venv\Scripts\python.exe" launcher.py
