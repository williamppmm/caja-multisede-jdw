import re
from pathlib import Path
from app.runtime_paths import get_app_data_dir, get_base_dir

# Base directory: parent of app/
BASE_DIR = get_base_dir()
APP_DATA_DIR = get_app_data_dir()

# Data directory: where Excel files live
# For development, the Excel is in the same folder as the project.
# Change DATA_DIR to a Dropbox path for production, e.g.:
#   DATA_DIR = Path("C:/Users/User/Dropbox/Caja")
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
    raw = re.sub(r'[<>:"/\\|?*]+', "", raw)
    return raw or "Principal"


def get_excel_filename(year: int, sede: str | None = None) -> str:
    return f"Contadores_{normalizar_sede_archivo(sede)}_{year}.xlsx"


def get_excel_path(year: int) -> Path:
    from app.services.settings_service import get_settings

    settings = get_settings()
    data_dir = Path(settings.get("data_dir") or DATA_DIR)
    return data_dir / get_excel_filename(year, settings.get("sede"))


def get_consolidado_filename(year: int, sede: str | None = None) -> str:
    return f"Consolidado_{normalizar_sede_archivo(sede)}_{year}.xlsx"


def get_consolidado_path(year: int) -> Path:
    from app.services.settings_service import get_settings

    settings = get_settings()
    data_dir = Path(settings.get("data_dir") or DATA_DIR)
    return data_dir / get_consolidado_filename(year, settings.get("sede"))


def get_excel_folder() -> Path:
    """Directorio donde viven los .xlsx de la sede activa.
    Usado para archivos que deben viajar junto al Excel (ej. startup_state.json,
    contadores_items.json) y que en la versión super-admin apuntan a la sede remota.
    """
    from app.services.settings_service import get_settings

    settings = get_settings()
    return Path(settings.get("data_dir") or DATA_DIR)
