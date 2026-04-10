import json
import shutil
from datetime import date

from app.services.local_data_service import get_local_data_path


_FILENAME = "startup_state.json"


def _get_path():
    """Resuelve la ruta de startup_state.json junto a los .xlsx de la sede activa.
    Si el archivo todavía vive en data/, lo migra automáticamente la primera vez.
    """
    from app.config import get_excel_folder

    target = get_excel_folder() / _FILENAME
    if not target.exists():
        legacy = get_local_data_path(_FILENAME)
        if legacy.exists():
            try:
                shutil.move(str(legacy), str(target))
            except Exception:
                return legacy
    return target


def _default_state() -> dict:
    return {
        "enabled": False,
        "fecha_inicio": "",
        "caja_inicial": 0.0,
        "contadores": {},
    }


def _normalizar_contadores(raw) -> dict[str, dict]:
    if not isinstance(raw, dict):
        return {}
    normalizados: dict[str, dict] = {}
    for item_id, value in raw.items():
        key = str(item_id or "").strip()
        if not key or not isinstance(value, dict):
            continue
        normalizados[key] = {
            "entradas": max(0, int(value.get("entradas", 0) or 0)),
            "salidas": max(0, int(value.get("salidas", 0) or 0)),
            "jackpot": max(0, int(value.get("jackpot", 0) or 0)),
        }
    return normalizados


def get_startup_state() -> dict:
    path = _get_path()
    if not path.exists():
        return _default_state()
    try:
        with open(path, encoding="utf-8") as fh:
            raw = json.load(fh)
        state = {
            "enabled": bool(raw.get("enabled", False)),
            "fecha_inicio": str(raw.get("fecha_inicio") or "").strip(),
            "caja_inicial": float(raw.get("caja_inicial", 0) or 0),
            "contadores": _normalizar_contadores(raw.get("contadores")),
        }
        return state
    except Exception:
        return _default_state()


def save_startup_state(data: dict) -> dict:
    raw_fecha = str(data.get("fecha_inicio") or "").strip()
    enabled = bool(data.get("enabled", False))
    if raw_fecha:
        date.fromisoformat(raw_fecha)
    state = {
        "enabled": enabled and bool(raw_fecha),
        "fecha_inicio": raw_fecha,
        "caja_inicial": max(0.0, float(data.get("caja_inicial", 0) or 0)),
        "contadores": _normalizar_contadores(data.get("contadores")),
    }
    with open(_get_path(), "w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=2, ensure_ascii=False)
    return state


def get_startup_date() -> date | None:
    state = get_startup_state()
    if not state.get("enabled") or not state.get("fecha_inicio"):
        return None
    try:
        return date.fromisoformat(state["fecha_inicio"])
    except ValueError:
        return None


def get_startup_cash() -> float | None:
    state = get_startup_state()
    if not state.get("enabled"):
        return None
    return float(state.get("caja_inicial", 0) or 0)


def get_startup_reference(item_id: str) -> dict | None:
    state = get_startup_state()
    if not state.get("enabled"):
        return None
    return state.get("contadores", {}).get(str(item_id or "").strip()) or None
