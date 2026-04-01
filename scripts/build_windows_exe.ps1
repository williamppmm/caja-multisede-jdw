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
$specFile   = Join-Path $projectRoot "CajaJDW.spec"

if (-not (Test-Path $venvPython)) {
    throw "No se encontro .venv. Ejecute primero 'Instalar Caja.bat'."
}

if (-not (Test-Path $specFile)) {
    throw "No se encontro CajaJDW.spec en $projectRoot."
}

Set-Location $projectRoot

Write-Step "Instalando dependencias de build"
# tzdata se instala solo para el build: PyInstaller la bundlea y evita la
# advertencia de zoneinfo. En Windows el runtime no la necesita (usa el
# registro del sistema), pero tenerla empaquetada hace el EXE autocontenido.
& $venvPython -m pip install pyinstaller tzdata --quiet

Write-Step "Construyendo ejecutable con CajaJDW.spec"
& $venvPython -m PyInstaller --noconfirm --clean $specFile

Write-Host ""
Write-Host "EXE generado en: $projectRoot\dist\CajaJDW.exe" -ForegroundColor Green
