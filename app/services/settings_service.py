import json
import os
import re
import subprocess
from pathlib import Path

from app.config import BASE_DIR
from app.services.local_data_service import get_local_data_path

SETTINGS_PATH = get_local_data_path("settings.json")


def _default_sede() -> str:
    return (os.getenv("CAJA_SEDE") or os.getenv("COMPUTERNAME") or "Principal").strip() or "Principal"


_DEFAULTS = {
    "modo_entrada": "cantidad",
    "sede": _default_sede(),
    "data_dir": str(BASE_DIR),
    "enabled_modules": ["caja", "gastos"],
    "default_module": "caja",
    # Super admin
    "super_admin_mode": False,
    "remote_sites": [],
    "active_site_id": "",
}

_settings_cache: dict | None = None
_settings_cache_mtime: float | None = None


def _normalizar_data_dir(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return str(BASE_DIR)
    return str(Path(raw).expanduser())


def _slug(text: str) -> str:
    """Genera un id simple desde un texto."""
    s = re.sub(r"\s+", "_", text.strip().lower())
    s = re.sub(r"[^a-z0-9_-]", "", s)
    return s or "sede"


def _normalizar_remote_site(raw: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    label = str(raw.get("label") or "").strip()
    sede = str(raw.get("sede") or label).strip()
    data_dir = str(raw.get("data_dir") or "").strip()
    if not label or not data_dir:
        return None
    site_id = str(raw.get("id") or _slug(label)).strip() or _slug(label)
    return {
        "id": site_id,
        "label": label,
        "sede": sede or label,
        "data_dir": str(Path(data_dir).expanduser()),
    }


def _normalizar_remote_sites(value) -> list[dict]:
    if not isinstance(value, list):
        return []
    seen_ids: set[str] = set()
    result = []
    for raw in value:
        site = _normalizar_remote_site(raw)
        if site and site["id"] not in seen_ids:
            seen_ids.add(site["id"])
            result.append(site)
    return result


def _resolver_settings() -> dict:
    if not SETTINGS_PATH.exists():
        return _DEFAULTS.copy()

    with open(SETTINGS_PATH, encoding="utf-8") as f:
        data = {**_DEFAULTS, **json.load(f)}
        if "enabled_modules" not in data:
            data["enabled_modules"] = ["caja", "gastos"] if data.get("mostrar_gastos") else ["caja"]
        data["enabled_modules"] = _normalizar_modulos(data.get("enabled_modules"))
        data["default_module"] = _normalizar_modulo_default(
            data.get("default_module"),
            data["enabled_modules"],
        )
        data["super_admin_mode"] = bool(data.get("super_admin_mode", False))
        data["remote_sites"] = _normalizar_remote_sites(data.get("remote_sites", []))
        data["active_site_id"] = str(data.get("active_site_id") or "").strip()
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


def _invalidar_cache() -> None:
    global _settings_cache, _settings_cache_mtime
    _settings_cache = None
    _settings_cache_mtime = None


def save_settings(data: dict) -> None:
    allowed = {"modo_entrada", "sede", "data_dir", "enabled_modules", "default_module",
               "super_admin_mode", "remote_sites", "active_site_id"}
    cleaned = {k: v for k, v in data.items() if k in allowed}
    if "sede" in cleaned:
        cleaned["sede"] = str(cleaned["sede"]).strip()
    if "data_dir" in cleaned:
        cleaned["data_dir"] = _normalizar_data_dir(cleaned["data_dir"])
    if "super_admin_mode" in cleaned:
        cleaned["super_admin_mode"] = bool(cleaned["super_admin_mode"])
    if "remote_sites" in cleaned:
        cleaned["remote_sites"] = _normalizar_remote_sites(cleaned["remote_sites"])
    if "active_site_id" in cleaned:
        cleaned["active_site_id"] = str(cleaned["active_site_id"] or "").strip()
    enabled_modules = _normalizar_modulos(cleaned.get("enabled_modules"))
    cleaned["enabled_modules"] = enabled_modules
    cleaned["default_module"] = _normalizar_modulo_default(cleaned.get("default_module"), enabled_modules)
    # Mergear con el archivo existente para no borrar claves no incluidas en esta llamada
    existing: dict = {}
    if SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH, encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            pass
    existing.update(cleaned)
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)
    _invalidar_cache()


# ── Helpers multi-sede ────────────────────────────────────────────────────────

def get_remote_sites() -> list[dict]:
    return get_settings().get("remote_sites", [])


def get_active_site() -> dict | None:
    settings = get_settings()
    if not settings.get("super_admin_mode"):
        return None
    active_id = settings.get("active_site_id", "")
    sites = settings.get("remote_sites", [])
    for site in sites:
        if site["id"] == active_id:
            return site
    return None


def set_active_site(site_id: str) -> dict:
    settings = get_settings()
    sites = settings.get("remote_sites", [])
    site = next((s for s in sites if s["id"] == site_id), None)
    if not site:
        return {"ok": False, "mensaje": f"Sede '{site_id}' no encontrada."}
    # Guardar preservando todos los campos existentes
    raw: dict = {}
    if SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH, encoding="utf-8") as f:
                raw = json.load(f)
        except Exception:
            pass
    raw["active_site_id"] = site_id
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(raw, f, indent=2, ensure_ascii=False)
    _invalidar_cache()
    return {"ok": True, "active_site": site}


def save_remote_sites(sites: list[dict]) -> list[dict]:
    normalizadas = _normalizar_remote_sites(sites)
    raw: dict = {}
    if SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH, encoding="utf-8") as f:
                raw = json.load(f)
        except Exception:
            pass
    raw["remote_sites"] = normalizadas
    ids = {s["id"] for s in normalizadas}
    current_active = raw.get("active_site_id", "")
    if current_active not in ids:
        # La sede activa desapareció o nunca hubo una: resetear sin auto-seleccionar
        raw["active_site_id"] = ""
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(raw, f, indent=2, ensure_ascii=False)
    _invalidar_cache()
    return normalizadas


def validate_remote_site(data_dir: str) -> dict:
    """Verifica que la carpeta existe, tiene xlsx y admite escritura."""
    import tempfile
    path = Path(str(data_dir or "").strip())
    if not path.exists():
        return {"ok": False, "mensaje": "La carpeta no existe."}
    if not path.is_dir():
        return {"ok": False, "mensaje": "La ruta no es una carpeta."}
    xlsx_files = list(path.glob("Contadores_*.xlsx")) + list(path.glob("Consolidado_*.xlsx"))
    # Prueba de escritura: crear y eliminar un archivo temporal
    try:
        fd, tmp_path = tempfile.mkstemp(dir=path, suffix=".tmp")
        os.close(fd)
        os.unlink(tmp_path)
    except Exception:
        return {
            "ok": False,
            "mensaje": "La carpeta no admite escritura (solo lectura, permisos insuficientes o conflicto de Dropbox).",
        }
    return {
        "ok": True,
        "archivos_encontrados": len(xlsx_files),
        "muestra": [f.name for f in xlsx_files[:5]],
    }


def _normalizar_modulos(value) -> list[str]:
    permitidos = ["bonos", "gastos", "prestamos", "movimientos", "plataformas", "contadores", "caja", "cuadre"]
    if not isinstance(value, list):
        value = ["caja"]
    modulos = [str(v).strip().lower() for v in value if str(v).strip().lower() in permitidos]
    if not modulos:
        modulos = ["caja"]
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
$dialog.Description = 'Seleccione la carpeta donde están los archivos Excel de la sede'
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
            title="Seleccione la carpeta donde están los archivos Excel de la sede",
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
