import os
import sys


if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")

if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

from app.main import app
from launcher_boot import launch_app


if __name__ == "__main__":
    launch_app(
        app,
        default_port=8000,
        mutex_name="CajaJDW_SingleInstance",
        app_id="cajajdw",
        splash_title="Caja JDW",
        splash_subtitle="Iniciando la aplicación...",
    )
