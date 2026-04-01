import json
import os
from app.config import BASE_DIR

SETTINGS_PATH = BASE_DIR / "settings.json"


def _default_sede() -> str:
    return (os.getenv("CAJA_SEDE") or os.getenv("COMPUTERNAME") or "Principal").strip() or "Principal"


_DEFAULTS = {
    "default_date": "today",
    "modo_entrada": "cantidad",
    "sede": _default_sede(),
}


def get_settings() -> dict:
    if not SETTINGS_PATH.exists():
        return _DEFAULTS.copy()
    try:
        with open(SETTINGS_PATH, encoding="utf-8") as f:
            return {**_DEFAULTS, **json.load(f)}
    except Exception:
        return _DEFAULTS.copy()


def save_settings(data: dict) -> None:
    allowed = {"default_date", "modo_entrada", "sede"}
    cleaned = {k: v for k, v in data.items() if k in allowed}
    if "sede" in cleaned:
        cleaned["sede"] = str(cleaned["sede"]).strip()
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2, ensure_ascii=False)
