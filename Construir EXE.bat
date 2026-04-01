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

powershell -ExecutionPolicy Bypass -File ".\scripts\build_windows_exe.ps1"

echo.
pause
