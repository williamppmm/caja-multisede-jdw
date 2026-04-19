import json
import os
import subprocess
from pathlib import Path

from app.config import BASE_DIR
from app.services.local_data_service import get_local_data_path
from app.services.operativa_config_service import get_operativa_config, save_operativa_config

SETTINGS_PATH = get_local_data_path("settings.json")


def _default_sede() -> str:
    return (os.getenv("CAJA_SEDE") or os.getenv("COMPUTERNAME") or "Principal").strip() or "Principal"


_DEFAULTS = {
    "modo_entrada": "cantidad",
    "sede": _default_sede(),
    "data_dir": str(BASE_DIR),
    "enabled_modules": ["caja", "gastos"],
    "default_module": "caja",
    "excluir_monedas_viejos_base": False,
}

_settings_cache: dict | None = None
_settings_cache_mtime: float | None = None


def _normalizar_data_dir(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return str(BASE_DIR)
    return str(Path(raw).expanduser())


def _resolver_settings() -> dict:
    if not SETTINGS_PATH.exists():
        data = _DEFAULTS.copy()
    else:
        with open(SETTINGS_PATH, encoding="utf-8") as f:
            data = {**_DEFAULTS, **json.load(f)}
            if "enabled_modules" not in data:
                data["enabled_modules"] = ["caja", "gastos"] if data.get("mostrar_gastos") else ["caja"]
            data["enabled_modules"] = _normalizar_modulos(data.get("enabled_modules"))
            data["default_module"] = _normalizar_modulo_default(
                data.get("default_module"),
                data["enabled_modules"],
            )

    operativa = get_operativa_config(data.get("data_dir"))
    data["excluir_monedas_viejos_base"] = bool(
        operativa.get(
            "excluir_monedas_viejos_base",
            data.get("excluir_monedas_viejos_base", False),
        )
    )
    return data


def get_settings() -> dict:
    global _settings_cache, _settings_cache_mtime

    try:
        current_mtime = SETTINGS_PATH.stat().st_mtime if SETTINGS_PATH.exists() else None
        if _settings_cache is not None and current_mtime == _settings_cache_mtime:
            return _settings_cache.copy()

        data = _resolver_settings()
        _settings_cache = data
        _settings_cache_mtime = current_mtime
        return data.copy()
    except Exception:
        return _DEFAULTS.copy()


def save_settings(data: dict) -> None:
    global _settings_cache, _settings_cache_mtime

    allowed = {
        "modo_entrada",
        "sede",
        "data_dir",
        "enabled_modules",
        "default_module",
        "excluir_monedas_viejos_base",
    }
    cleaned = {k: v for k, v in data.items() if k in allowed}
    if "sede" in cleaned:
        cleaned["sede"] = str(cleaned["sede"]).strip()
    if "data_dir" in cleaned:
        cleaned["data_dir"] = _normalizar_data_dir(cleaned["data_dir"])
    if "excluir_monedas_viejos_base" in cleaned:
        cleaned["excluir_monedas_viejos_base"] = bool(cleaned["excluir_monedas_viejos_base"])
    enabled_modules = _normalizar_modulos(cleaned.get("enabled_modules"))
    cleaned["enabled_modules"] = enabled_modules
    cleaned["default_module"] = _normalizar_modulo_default(cleaned.get("default_module"), enabled_modules)
    data_dir_destino = cleaned.get("data_dir")
    if not data_dir_destino and SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH, encoding="utf-8") as f:
                existente = json.load(f)
            data_dir_destino = existente.get("data_dir")
        except Exception:
            data_dir_destino = None

    if "excluir_monedas_viejos_base" in cleaned:
        save_operativa_config(
            data_dir_destino,
            {"excluir_monedas_viejos_base": cleaned["excluir_monedas_viejos_base"]},
        )

    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2, ensure_ascii=False)
    _settings_cache = None
    _settings_cache_mtime = None


def _normalizar_modulos(value) -> list[str]:
    permitidos = ["bonos", "gastos", "prestamos", "movimientos", "plataformas", "contadores", "caja", "cuadre", "resumen"]
    if not isinstance(value, list):
        value = ["caja"]
    modulos = [str(v).strip().lower() for v in value if str(v).strip().lower() in permitidos]
    if not modulos:
        modulos = ["caja"]
    # Mantener orden lógico.
    return [m for m in permitidos if m in modulos]


def _normalizar_modulo_default(value, enabled_modules: list[str]) -> str:
    modulo = str(value or "").strip().lower()
    if modulo in enabled_modules:
        return modulo
    return enabled_modules[0]


def _powershell_startupinfo():
    startupinfo = None
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    return startupinfo


def _select_excel_file_with_powershell(initial_dir: str | None = None) -> str | None:
    if os.name != "nt":
        return None

    initial = _normalizar_data_dir(initial_dir).replace("'", "''")
    script = f"""
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Seleccione un archivo Excel anual para tomar su carpeta'
$dialog.Filter = 'Archivos Excel (*.xlsx)|*.xlsx'
$dialog.InitialDirectory = '{initial}'
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    [Console]::Out.Write($dialog.FileName)
}}
"""
    try:
        result = subprocess.run(
            [
                r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
                "-NoProfile",
                "-STA",
                "-Command",
                script,
            ],
            capture_output=True,
            text=True,
            startupinfo=_powershell_startupinfo(),
            check=False,
        )
        selected = (result.stdout or "").strip()
        if not selected:
            return None
        return _normalizar_data_dir(str(Path(selected).parent))
    except Exception:
        return None


def _select_directory_with_powershell(initial_dir: str | None = None) -> str | None:
    if os.name != "nt":
        return None

    initial = _normalizar_data_dir(initial_dir).replace("'", "''")
    script = f"""
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Seleccione la carpeta donde se guardarán los archivos anuales por sede'
$dialog.SelectedPath = '{initial}'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    [Console]::Out.Write($dialog.SelectedPath)
}}
"""
    try:
        result = subprocess.run(
            [
                r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
                "-NoProfile",
                "-STA",
                "-Command",
                script,
            ],
            capture_output=True,
            text=True,
            startupinfo=_powershell_startupinfo(),
            check=False,
        )
        selected = (result.stdout or "").strip()
        return _normalizar_data_dir(selected) if selected else None
    except Exception:
        return None


def select_directory_dialog(initial_dir: str | None = None) -> str | None:
    selected = _select_directory_with_powershell(initial_dir)
    if selected:
        return selected

    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(
            title="Seleccione la carpeta donde se guardarán los archivos anuales por sede",
            initialdir=_normalizar_data_dir(initial_dir),
        )
        root.destroy()
        return _normalizar_data_dir(selected) if selected else None
    except Exception:
        return None


def select_excel_file_dialog(initial_dir: str | None = None) -> str | None:
    selected = _select_excel_file_with_powershell(initial_dir)
    if selected:
        return selected

    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askopenfilename(
            title="Seleccione un archivo Excel anual para tomar su carpeta",
            initialdir=_normalizar_data_dir(initial_dir),
            filetypes=[("Archivos Excel", "*.xlsx")],
        )
        root.destroy()
        if not selected:
            return None
        return _normalizar_data_dir(str(Path(selected).parent))
    except Exception:
        return None


def select_text_file_dialog(initial_dir: str | None = None) -> str | None:
    if os.name == "nt":
        initial = _normalizar_data_dir(initial_dir).replace("'", "''")
        script = f"""
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Seleccione un archivo TXT con nombres de clientes'
$dialog.Filter = 'Archivos de texto (*.txt)|*.txt'
$dialog.InitialDirectory = '{initial}'
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    [Console]::Out.Write($dialog.FileName)
}}
"""
        try:
            result = subprocess.run(
                [
                    r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
                    "-NoProfile",
                    "-STA",
                    "-Command",
                    script,
                ],
                capture_output=True,
                text=True,
                startupinfo=_powershell_startupinfo(),
                check=False,
            )
            selected = (result.stdout or "").strip()
            if selected:
                return selected
        except Exception:
            pass

    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askopenfilename(
            title="Seleccione un archivo TXT con nombres de clientes",
            initialdir=_normalizar_data_dir(initial_dir),
            filetypes=[("Archivos TXT", "*.txt")],
        )
        root.destroy()
        return selected or None
    except Exception:
        return None
