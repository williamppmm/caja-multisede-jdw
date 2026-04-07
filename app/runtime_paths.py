import sys
from pathlib import Path


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def get_base_dir() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def get_app_data_dir() -> Path:
    data_dir = get_base_dir() / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_resource_root() -> Path:
    if is_frozen():
        return Path(getattr(sys, "_MEIPASS", get_base_dir()))
    return get_base_dir()


def get_web_dir() -> Path:
    return get_resource_root() / "web"
