import os
import sys

# Marca que identifica esta ejecución como el build dedicado de super admin.
# settings_service lo detecta y fuerza super_admin_mode=True sin escribirlo en disco.
os.environ["CAJA_SUPER_ADMIN"] = "1"


if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")

if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

from app.main import app
from launcher_boot import launch_app


if __name__ == "__main__":
    launch_app(
        app,
        default_port=8001,
        mutex_name="CajaJDW_SuperAdmin_SingleInstance",
        app_id="cajajdw_super_admin",
        splash_title="Caja JDW Super Admin",
        splash_subtitle="Iniciando el panel de auditoría...",
    )
