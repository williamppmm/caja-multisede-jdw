import os
import socket
import sys
import threading
import time
import webbrowser

# Marca que identifica esta ejecución como el build dedicado de super admin.
# settings_service lo detecta y fuerza super_admin_mode=True sin escribirlo en disco.
os.environ["CAJA_SUPER_ADMIN"] = "1"


if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")

if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

import uvicorn

from app.main import app


HOST = "127.0.0.1"
DEFAULT_PORT = 8001          # Puerto distinto para poder correr junto a CajaJDW


def _puerto_en_uso(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((HOST, port)) == 0


def _encontrar_puerto_libre() -> int:
    for port in range(DEFAULT_PORT, DEFAULT_PORT + 10):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((HOST, port))
                return port
            except OSError:
                continue
    raise OSError("No se encontró un puerto disponible entre 8001 y 8010.")


def _esperar_servidor_y_abrir(url: str):
    port = int(url.split(":")[-1])
    for _ in range(60):
        try:
            with socket.create_connection((HOST, port), timeout=0.5):
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(0.5)


if __name__ == "__main__":
    if _puerto_en_uso(DEFAULT_PORT):
        webbrowser.open(f"http://{HOST}:{DEFAULT_PORT}")
        sys.exit(0)

    port = _encontrar_puerto_libre()
    url = f"http://{HOST}:{port}"
    threading.Thread(target=_esperar_servidor_y_abrir, args=(url,), daemon=True).start()
    uvicorn.run(app, host=HOST, port=port)
