[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Write-Step($message) {
    Write-Host ""
    Write-Host "==> $message" -ForegroundColor Cyan
}

function Get-PythonCommand {
    $candidates = @(
        @{ Exe = "py"; Args = @("-3.11") },
        @{ Exe = "py"; Args = @("-3") },
        @{ Exe = "python"; Args = @() }
    )

    foreach ($candidate in $candidates) {
        try {
            & $candidate.Exe @($candidate.Args + @("--version")) | Out-Null
            return $candidate
        }
        catch {
        }
    }

    throw "No se encontro Python. Instale Python 3.11 o superior y vuelva a ejecutar el instalador."
}

function Ensure-Venv($projectRoot, $pythonCmd) {
    $venvPath = Join-Path $projectRoot ".venv"
    if (-not (Test-Path $venvPath)) {
        Write-Step "Creando entorno virtual"
        & $pythonCmd.Exe @($pythonCmd.Args + @("-m", "venv", ".venv"))
    }
    return $venvPath
}

function Install-Dependencies($projectRoot, $venvPath) {
    $pythonExe = Join-Path $venvPath "Scripts\python.exe"
    Write-Step "Actualizando pip"
    & $pythonExe -m pip install --upgrade pip

    Write-Step "Instalando dependencias"
    & $pythonExe -m pip install -r (Join-Path $projectRoot "requirements.txt")
}

function New-DesktopShortcut($projectRoot) {
    $desktop = [Environment]::GetFolderPath("Desktop")
    if (-not $desktop) {
        return
    }

    $shortcutPath = Join-Path $desktop "Iniciar Caja.lnk"
    $targetPath = Join-Path $projectRoot "Iniciar Caja.bat"

    Write-Step "Creando acceso directo en el escritorio"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $targetPath
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,220"
    $shortcut.Save()
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Set-Location $projectRoot

Write-Step "Buscando Python"
$pythonCmd = Get-PythonCommand

$venvPath = Ensure-Venv -projectRoot $projectRoot -pythonCmd $pythonCmd
Install-Dependencies -projectRoot $projectRoot -venvPath $venvPath
New-DesktopShortcut -projectRoot $projectRoot

Write-Host ""
Write-Host "Instalacion completada." -ForegroundColor Green
Write-Host "Puede iniciar la aplicacion con:" -ForegroundColor Green
Write-Host "  $projectRoot\Iniciar Caja.bat" -ForegroundColor Green
