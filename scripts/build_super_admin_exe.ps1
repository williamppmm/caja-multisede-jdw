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
$specFile   = Join-Path $projectRoot "CajaSuperAdmin.spec"

if (-not (Test-Path $venvPython)) {
    throw "No se encontro .venv. Ejecute primero 'Instalar Caja.bat'."
}

if (-not (Test-Path $specFile)) {
    throw "No se encontro CajaSuperAdmin.spec en $projectRoot."
}

Set-Location $projectRoot

Write-Step "Instalando dependencias de build"
& $venvPython -m pip install pyinstaller tzdata --quiet

Write-Step "Construyendo CajaSuperAdmin.exe"
& $venvPython -m PyInstaller --noconfirm --clean $specFile

Write-Host ""
Write-Host "EXE generado en: $projectRoot\dist\CajaSuperAdmin.exe" -ForegroundColor Green
