from pathlib import Path
import shutil

from app.config import APP_DATA_DIR, BASE_DIR


def get_local_data_path(filename: str) -> Path:
    target = APP_DATA_DIR / filename
    legacy = BASE_DIR / filename

    if target.exists():
        return target

    if legacy.exists():
        APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
        try:
            shutil.move(str(legacy), str(target))
        except Exception:
            # Si mover falla por cualquier razón, seguimos usando el archivo legacy.
            return legacy

    return target
