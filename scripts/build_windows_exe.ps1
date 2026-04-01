[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Write-Step($message) {
    Write-Host ""
    Write-Host "==> $message" -ForegroundColor Cyan
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    throw "No se encontro .venv. Ejecute primero 'Instalar Caja.bat'."
}

Set-Location $projectRoot

Write-Step "Instalando PyInstaller"
& $venvPython -m pip install pyinstaller

Write-Step "Construyendo ejecutable"
& $venvPython -m PyInstaller `
    --noconfirm `
    --clean `
    --name "CajaJDW" `
    --onefile `
    --noconsole `
    --add-data "web;web" `
    --collect-submodules uvicorn `
    launcher.py

Write-Host ""
Write-Host "EXE generado en: $projectRoot\dist\CajaJDW.exe" -ForegroundColor Green
