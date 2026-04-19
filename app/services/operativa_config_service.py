import json
from pathlib import Path

from app.config import BASE_DIR

CONFIG_OPERATIVA_FILENAME = "config_operativa.json"

_DEFAULTS = {
    "excluir_monedas_viejos_base": False,
}


def _normalizar_data_dir(value: str | None) -> Path:
    raw = str(value or "").strip()
    if not raw:
        return BASE_DIR
    return Path(raw).expanduser()


def _config_path(data_dir: str | None) -> Path:
    return _normalizar_data_dir(data_dir) / CONFIG_OPERATIVA_FILENAME


def _normalizar_config(raw: dict | None) -> dict:
    data = {**_DEFAULTS}
    if isinstance(raw, dict):
        data["excluir_monedas_viejos_base"] = bool(raw.get("excluir_monedas_viejos_base", False))
    return data


def get_operativa_config(data_dir: str | None) -> dict:
    path = _config_path(data_dir)
    if not path.exists():
        return _DEFAULTS.copy()
    try:
        with open(path, encoding="utf-8") as f:
            return _normalizar_config(json.load(f))
    except Exception:
        return _DEFAULTS.copy()


def save_operativa_config(data_dir: str | None, data: dict | None) -> dict:
    path = _config_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    config = _normalizar_config(data)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    return config.copy()
