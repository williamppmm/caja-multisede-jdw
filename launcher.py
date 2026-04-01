import socket
import threading
import time
import webbrowser

import uvicorn

from app.main import app


HOST = "127.0.0.1"
PORT = 8000
URL = f"http://{HOST}:{PORT}"


def _esperar_servidor_y_abrir():
    for _ in range(60):
        try:
            with socket.create_connection((HOST, PORT), timeout=0.5):
                webbrowser.open(URL)
                return
        except OSError:
            time.sleep(0.5)


if __name__ == "__main__":
    threading.Thread(target=_esperar_servidor_y_abrir, daemon=True).start()
    uvicorn.run(app, host=HOST, port=PORT)
