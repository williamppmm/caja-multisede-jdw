import json
import os
import re
import subprocess
from pathlib import Path

from app.config import BASE_DIR
from app.services.local_data_service import get_local_data_path
from app.services.operativa_config_service import (
    CONFIG_OPERATIVA_FILENAME,
    get_operativa_config,
    save_operativa_config,
)

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
    # Referencias externas de Plataformas
    "plataformas_ref_practi_path": "",
    "plataformas_ref_bet_path": "",
    "plataformas_ref": {"practi_header": "", "bet_header": ""},
    # Respaldos automáticos (solo super admin)
    "backup_enabled": False,
    "backup_root": "",
}

_settings_cache: dict | None = None
_settings_cache_mtime: tuple[float | None, float | None] | None = None


def _normalizar_data_dir(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return str(BASE_DIR)
    return str(Path(raw).expanduser())


def _normalizar_path_absoluto(value: str | None) -> str:
    """Devuelve la ruta con expanduser + resolve para eliminar '..' y symlinks.
    Usa strict=False para no fallar si la ruta aún no existe.
    """
    raw = str(value or "").strip()
    if not raw:
        return ""
    return str(Path(raw).expanduser().resolve())


def _resolver_data_dir_activo(settings_data: dict | None) -> str:
    if not isinstance(settings_data, dict):
        return str(BASE_DIR)

    if settings_data.get("super_admin_mode"):
        active_id = str(settings_data.get("active_site_id") or "").strip()
        for site in _normalizar_remote_sites(settings_data.get("remote_sites", [])):
            if site["id"] == active_id:
                return _normalizar_data_dir(site.get("data_dir"))

    return _normalizar_data_dir(settings_data.get("data_dir"))


def _get_operativa_mtime(settings_data: dict | None) -> float | None:
    path = Path(_resolver_data_dir_activo(settings_data)) / CONFIG_OPERATIVA_FILENAME
    try:
        return path.stat().st_mtime if path.exists() else None
    except Exception:
        return None


def _slug(text: str) -> str:
    """Genera un id simple desde un texto."""
    s = re.sub(r"\s+", "_", text.strip().lower())
    s = re.sub(r"[^a-z0-9_-]", "", s)
    return s or "sede"


def _normalizar_plataformas_ref(raw) -> dict:
    if not isinstance(raw, dict):
        return {"practi_header": "", "bet_header": ""}
    return {
        "practi_header": str(raw.get("practi_header") or "").strip(),
        "bet_header": str(raw.get("bet_header") or "").strip(),
    }


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
        "data_dir": _normalizar_path_absoluto(data_dir),
        "plataformas_ref": _normalizar_plataformas_ref(raw.get("plataformas_ref")),
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


def is_super_admin_build() -> bool:
    """True cuando el proceso arrancó desde launcher_super_admin.py."""
    return os.getenv("CAJA_SUPER_ADMIN") == "1"


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
    data["super_admin_mode"] = bool(data.get("super_admin_mode", False))
    data["remote_sites"] = _normalizar_remote_sites(data.get("remote_sites", []))
    data["active_site_id"] = str(data.get("active_site_id") or "").strip()
    data["plataformas_ref_practi_path"] = _normalizar_path_absoluto(data.get("plataformas_ref_practi_path"))
    data["plataformas_ref_bet_path"] = _normalizar_path_absoluto(data.get("plataformas_ref_bet_path"))
    data["plataformas_ref"] = _normalizar_plataformas_ref(data.get("plataformas_ref"))
    data["backup_enabled"] = bool(data.get("backup_enabled", False))
    data["backup_root"] = _normalizar_data_dir(data.get("backup_root")) if data.get("backup_root") else ""
    # El build dedicado siempre opera en super admin, independiente de lo que diga settings.json
    data["excluir_monedas_viejos_base"] = bool(get_operativa_config().get("excluir_monedas_viejos_base"))
    if is_super_admin_build():
        data["super_admin_mode"] = True
        # Todos los módulos disponibles para poder completar cualquier sede
        data["enabled_modules"] = _normalizar_modulos(
            data["enabled_modules"] or _normalizar_modulos(list(_DEFAULTS["enabled_modules"]))
        )
        all_modules = ["caja", "plataformas", "gastos", "bonos", "prestamos", "movimientos", "contadores", "cuadre", "faltantes"]
        for m in all_modules:
            if m not in data["enabled_modules"]:
                data["enabled_modules"].append(m)
    return data


def get_settings() -> dict:
    global _settings_cache, _settings_cache_mtime

    try:
        current_mtime = SETTINGS_PATH.stat().st_mtime if SETTINGS_PATH.exists() else None
        current_operativa_mtime = _get_operativa_mtime(_settings_cache)
        current_signature = (current_mtime, current_operativa_mtime)
        if _settings_cache is not None and current_signature == _settings_cache_mtime:
            return _settings_cache.copy()

        data = _resolver_settings()
        _settings_cache = data
        _settings_cache_mtime = (current_mtime, _get_operativa_mtime(data))
        return data.copy()
    except Exception:
        return _DEFAULTS.copy()


def _invalidar_cache() -> None:
    global _settings_cache, _settings_cache_mtime
    _settings_cache = None
    _settings_cache_mtime = None


def save_settings(data: dict) -> None:
    allowed = {"modo_entrada", "sede", "data_dir", "enabled_modules", "default_module",
               "super_admin_mode", "remote_sites", "active_site_id",
               "plataformas_ref_practi_path", "plataformas_ref_bet_path", "plataformas_ref",
               "backup_enabled", "backup_root"}
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
    if "plataformas_ref_practi_path" in cleaned:
        cleaned["plataformas_ref_practi_path"] = _normalizar_path_absoluto(cleaned["plataformas_ref_practi_path"])
    if "plataformas_ref_bet_path" in cleaned:
        cleaned["plataformas_ref_bet_path"] = _normalizar_path_absoluto(cleaned["plataformas_ref_bet_path"])
    if "plataformas_ref" in cleaned:
        cleaned["plataformas_ref"] = _normalizar_plataformas_ref(cleaned["plataformas_ref"])
    if "backup_enabled" in cleaned:
        cleaned["backup_enabled"] = bool(cleaned["backup_enabled"])
    if "backup_root" in cleaned:
        cleaned["backup_root"] = _normalizar_data_dir(cleaned["backup_root"]) if cleaned.get("backup_root") else ""
    # Mergear con el archivo existente para no borrar claves no incluidas en esta llamada
    existing: dict = {}
    if SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH, encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            pass

    merged = {**existing, **cleaned}

    if "enabled_modules" in cleaned:
        merged["enabled_modules"] = _normalizar_modulos(cleaned["enabled_modules"])
    elif "enabled_modules" in merged:
        merged["enabled_modules"] = _normalizar_modulos(merged.get("enabled_modules"))

    if "enabled_modules" in merged:
        merged["default_module"] = _normalizar_modulo_default(
            cleaned.get("default_module", merged.get("default_module")),
            merged["enabled_modules"],
        )

    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
    if "excluir_monedas_viejos_base" in data:
        save_operativa_config({"excluir_monedas_viejos_base": bool(data["excluir_monedas_viejos_base"])})
    _invalidar_cache()


# ── Helpers multi-sede ────────────────────────────────────────────────────────

def get_remote_sites() -> list[dict]:
    return get_settings().get("remote_sites", [])


def get_active_site() -> dict | None:
    settings = get_settings()
    if not settings.get("super_admin_mode"):
        return None
    active_id = settings.get("active_site_id", "")
    if not active_id:
        return None
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
    save_settings({"active_site_id": site_id})
    return {"ok": True, "active_site": site}


def save_remote_sites(sites: list[dict]) -> list[dict]:
    normalizadas = _normalizar_remote_sites(sites)
    settings = get_settings()
    ids = {s["id"] for s in normalizadas}
    current_active = str(settings.get("active_site_id") or "").strip()
    if current_active not in ids:
        current_active = normalizadas[0]["id"] if len(normalizadas) == 1 else ""
    save_settings({
        "remote_sites": normalizadas,
        "active_site_id": current_active,
    })
    return normalizadas


def validate_remote_site(data_dir: str) -> dict:
    """Verifica que la carpeta existe, tiene xlsx, admite escritura y detecta el nombre de sede."""
    import re
    import tempfile
    from app.config import normalizar_sede_archivo
    path = Path(str(data_dir or "").strip())
    if not path.exists():
        return {"ok": False, "mensaje": "La carpeta no existe."}
    if not path.is_dir():
        return {"ok": False, "mensaje": "La ruta no es una carpeta."}
    contadores_files = sorted(path.glob("Contadores_*.xlsx"))
    xlsx_files = list(contadores_files) + list(path.glob("Consolidado_*.xlsx"))
    # Extraer nombres de sede desde Contadores_{sede}_{año}.xlsx
    sedes_encontradas: list[str] = []
    seen: set[str] = set()
    for f in contadores_files:
        m = re.match(r"Contadores_(.+)_\d{4}\.xlsx$", f.name)
        if m:
            sede = normalizar_sede_archivo(m.group(1))
            if sede not in seen:
                seen.add(sede)
                sedes_encontradas.append(sede)
    # Prueba de escritura
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
        "sede_detectada": sedes_encontradas[0] if sedes_encontradas else None,
        "sedes_encontradas": sedes_encontradas,
    }


def get_plataformas_ref_config() -> dict:
    """Devuelve rutas globales y mapeo de encabezados para la sede activa.

    Resuelve el mapeo en este orden:
    1. Si super_admin_mode y hay active_site → usa plataformas_ref del site
    2. Si no → usa plataformas_ref del root de settings (versión usuario)
    """
    settings = get_settings()
    practi_path = settings.get("plataformas_ref_practi_path", "")
    bet_path = settings.get("plataformas_ref_bet_path", "")

    if settings.get("super_admin_mode"):
        site = get_active_site()
        ref = site.get("plataformas_ref", {}) if site else {}
    else:
        ref = settings.get("plataformas_ref", {})

    return {
        "practi_path": practi_path,
        "bet_path": bet_path,
        "practi_header": str(ref.get("practi_header") or "").strip(),
        "bet_header": str(ref.get("bet_header") or "").strip(),
    }


def _normalizar_modulos(value) -> list[str]:
    permitidos = ["bonos", "gastos", "prestamos", "movimientos", "plataformas", "contadores", "caja", "cuadre", "faltantes"]
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


def abrir_xlsx_en_hoja(path: Path, nombre_hoja: str, target_row: int | None = None) -> dict:
    if os.name != "nt":
        return {"ok": False, "mensaje": "Abrir Excel desde la app solo está disponible en Windows."}
    if not path.exists():
        return {"ok": False, "mensaje": f"No se encontró el archivo {path.name}."}

    powershell_exe = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
    path_ps = str(path).replace("'", "''")
    hoja_ps = str(nombre_hoja or "").replace("'", "''")
    target_row_ps = int(target_row) if isinstance(target_row, int) and target_row >= 2 else 0
    script = f"""
$ErrorActionPreference = 'Stop'
$xl = $null
$wb = $null
try {{
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $true
    $xl.DisplayAlerts = $false
    $wb = $xl.Workbooks.Open('{path_ps}')
    $sheet = $wb.Worksheets.Item('{hoja_ps}')
    $sheet.Activate() | Out-Null
    if ($xl.ActiveWindow -ne $null) {{
        $targetRow = {target_row_ps}
        if ($targetRow -lt 2) {{
            $targetRow = $sheet.Cells($sheet.Rows.Count, 1).End(-4162).Row
        }}
        if ($targetRow -gt 1) {{
            $sheet.Cells.Item($targetRow, 1).Select() | Out-Null
            $xl.ActiveWindow.ScrollRow = [Math]::Max(1, $targetRow - 5)
        }} else {{
            $xl.ActiveWindow.ScrollRow = 1
        }}
        $xl.ActiveWindow.ScrollColumn = 1
    }}
}} catch {{
    Write-Error $_
    exit 1
}}
"""
    try:
        process = subprocess.Popen(
            [
                powershell_exe,
                "-NoProfile",
                "-STA",
                "-Command",
                script,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            startupinfo=_powershell_startupinfo(),
        )
        try:
            _, stderr = process.communicate(timeout=2)
            if process.returncode not in (0, None):
                detalle = (stderr or "").strip()
                if "Worksheets.Item" in detalle or "subscript out of range" in detalle.lower():
                    return {"ok": False, "mensaje": f"No se encontró la hoja '{nombre_hoja}' en {path.name}."}
                if "activex component" in detalle.lower() or "comobject" in detalle.lower():
                    return {"ok": False, "mensaje": "No se pudo abrir Excel. Verifica que Microsoft Excel esté instalado."}
                return {"ok": False, "mensaje": f"No se pudo abrir {path.name} en Excel."}
        except subprocess.TimeoutExpired:
            pass  # sigue corriendo = Excel está cargando, es el caso normal
        return {
            "ok": True,
            "mensaje": f"Abriendo {path.name} en la hoja '{nombre_hoja}'.",
            "path": str(path),
            "sheet": nombre_hoja,
            "row": target_row if target_row_ps else None,
        }
    except Exception:
        return {"ok": False, "mensaje": f"No se pudo abrir {path.name} en Excel."}


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
