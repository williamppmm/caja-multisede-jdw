from pathlib import Path

# Base directory: parent of app/
BASE_DIR = Path(__file__).parent.parent

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


def get_excel_path(year: int) -> Path:
    from app.services.settings_service import get_settings

    settings = get_settings()
    data_dir = Path(settings.get("data_dir") or DATA_DIR)
    return data_dir / f"Caja_{year}.xlsx"
