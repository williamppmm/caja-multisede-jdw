import re
from pathlib import Path
from app.runtime_paths import get_app_data_dir, get_base_dir

# Base directory: parent of app/
BASE_DIR = get_base_dir()
APP_DATA_DIR = get_app_data_dir()

# Data directory: where Excel files live
DATA_DIR = BASE_DIR

DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000]

HOJA_REGISTROS = "RegistrosDiarios"

ENCABEZADOS = [
    "fecha",
    "tipo_registro",
    "concepto",
    "denominacion",
    "cantidad",
    "valor_unitario",
    "subtotal",
    "fecha_hora_registro",
]


def normalizar_sede_archivo(sede: str | None) -> str:
    raw = re.sub(r"\s+", "_", str(sede or "").strip())
    raw = re.sub(r'[<>:"/\|?*]+', "", raw)
    return raw or "Principal"


def get_excel_filename(year: int, sede: str | None = None) -> str:
    return f"Contadores_{normalizar_sede_archivo(sede)}_{year}.xlsx"


def get_consolidado_filename(year: int, sede: str | None = None) -> str:
    return f"Consolidado_{normalizar_sede_archivo(sede)}_{year}.xlsx"


def _get_active_dir_and_sede() -> tuple[Path, str]:
    """Devuelve (data_dir, sede) del contexto activo.
    En super_admin_mode usa la sede remota seleccionada; si no, usa settings local.
    """
    from app.services.settings_service import get_settings, get_active_site

    settings = get_settings()
    if settings.get("super_admin_mode"):
        site = get_active_site()
        if site:
            return Path(site["data_dir"]), site["sede"]
    return Path(settings.get("data_dir") or DATA_DIR), settings.get("sede") or "Principal"


def get_excel_folder() -> Path:
    """Directorio donde viven los .xlsx de la sede activa.
    En super_admin_mode apunta a la sede remota seleccionada.
    """
    return _get_active_dir_and_sede()[0]


def get_excel_path(year: int) -> Path:
    data_dir, sede = _get_active_dir_and_sede()
    return data_dir / get_excel_filename(year, sede)


def get_consolidado_path(year: int) -> Path:
    data_dir, sede = _get_active_dir_and_sede()
    return data_dir / get_consolidado_filename(year, sede)
