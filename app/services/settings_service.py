import json
import os
from pathlib import Path

from app.config import BASE_DIR

SETTINGS_PATH = BASE_DIR / "settings.json"


def _default_sede() -> str:
    return (os.getenv("CAJA_SEDE") or os.getenv("COMPUTERNAME") or "Principal").strip() or "Principal"


_DEFAULTS = {
    "default_date": "today",
    "modo_entrada": "cantidad",
    "sede": _default_sede(),
    "data_dir": str(BASE_DIR),
}


def _normalizar_data_dir(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return str(BASE_DIR)
    return str(Path(raw).expanduser())


def get_settings() -> dict:
    if not SETTINGS_PATH.exists():
        return _DEFAULTS.copy()
    try:
        with open(SETTINGS_PATH, encoding="utf-8") as f:
            return {**_DEFAULTS, **json.load(f)}
    except Exception:
        return _DEFAULTS.copy()


def save_settings(data: dict) -> None:
    allowed = {"default_date", "modo_entrada", "sede", "data_dir"}
    cleaned = {k: v for k, v in data.items() if k in allowed}
    if "sede" in cleaned:
        cleaned["sede"] = str(cleaned["sede"]).strip()
    if "data_dir" in cleaned:
        cleaned["data_dir"] = _normalizar_data_dir(cleaned["data_dir"])
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2, ensure_ascii=False)


def select_directory_dialog(initial_dir: str | None = None) -> str | None:
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(
            title="Seleccione la carpeta donde se guardan los archivos Caja_YYYY.xlsx",
            initialdir=_normalizar_data_dir(initial_dir),
        )
        root.destroy()
        return _normalizar_data_dir(selected) if selected else None
    except Exception:
        return None


def select_excel_file_dialog(initial_dir: str | None = None) -> str | None:
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
