import os
import socket
import sys
import threading
import time
import webbrowser


if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")

if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

import uvicorn

from app.main import app


HOST = "127.0.0.1"
DEFAULT_PORT = 8000
PORT = DEFAULT_PORT
URL = f"http://{HOST}:{PORT}"


def _encontrar_puerto_disponible() -> int:
    for port in range(DEFAULT_PORT, DEFAULT_PORT + 10):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((HOST, port))
                return port
            except OSError:
                continue
    raise OSError("No se encontró un puerto disponible entre 8000 y 8009.")


def _esperar_servidor_y_abrir():
    for _ in range(60):
        try:
            with socket.create_connection((HOST, PORT), timeout=0.5):
                webbrowser.open(URL)
                return
        except OSError:
            time.sleep(0.5)


if __name__ == "__main__":
    PORT = _encontrar_puerto_disponible()
    URL = f"http://{HOST}:{PORT}"
    threading.Thread(target=_esperar_servidor_y_abrir, daemon=True).start()
    uvicorn.run(app, host=HOST, port=PORT)
