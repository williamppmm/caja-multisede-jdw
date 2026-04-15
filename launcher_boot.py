import ctypes
import json
import socket
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

from app.services.local_data_service import get_local_data_path

try:
    import pyi_splash
except Exception:
    pyi_splash = None


HOST = "127.0.0.1"
ERROR_ALREADY_EXISTS = 183


def _puerto_en_uso(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((HOST, port)) == 0


def _encontrar_puerto_libre(default_port: int) -> int:
    for port in range(default_port, default_port + 10):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((HOST, port))
                return port
            except OSError:
                continue
    raise OSError(f"No se encontró un puerto disponible entre {default_port} y {default_port + 9}.")


def _state_path(app_id: str) -> Path:
    return get_local_data_path(f"{app_id}_instance.json")


def _guardar_state(app_id: str, url: str) -> None:
    path = _state_path(app_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"url": url}, ensure_ascii=False),
        encoding="utf-8",
    )


def _leer_state(app_id: str) -> str | None:
    path = _state_path(app_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    url = str(data.get("url") or "").strip()
    return url or None


def _limpiar_state(app_id: str) -> None:
    path = _state_path(app_id)
    try:
        if path.exists():
            path.unlink()
    except Exception:
        pass


def _adquirir_mutex(nombre: str):
    try:
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.CreateMutexW(None, False, nombre)
        if not handle:
            return None, False
        return handle, kernel32.GetLastError() == ERROR_ALREADY_EXISTS
    except Exception:
        return None, False


class StartupSplash:
    def __init__(self, titulo: str, subtitulo: str):
        self.titulo = titulo
        self.subtitulo = subtitulo

    def start(self) -> None:
        return None

    def close(self) -> None:
        try:
            if pyi_splash is not None:
                pyi_splash.close()
        except Exception:
            pass


def _esperar_url_instancia(app_id: str, fallback_url: str, timeout_s: float = 10.0) -> str:
    """Espera hasta que la instancia primaria escriba su URL en el state file."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        url = _leer_state(app_id)
        if url:
            return url
        time.sleep(0.2)
    return fallback_url


def _esperar_servidor_y_abrir(
    url: str,
    splash: StartupSplash | None = None,
    timeout_s: float = 30.0,
) -> None:
    port = int(url.rsplit(":", 1)[-1])
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with socket.create_connection((HOST, port), timeout=0.5):
                if splash is not None:
                    splash.close()
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(0.4)
    if splash is not None:
        splash.close()


def launch_app(
    app,
    *,
    default_port: int,
    mutex_name: str,
    app_id: str,
    splash_title: str,
    splash_subtitle: str,
) -> None:
    mutex_handle, already_running = _adquirir_mutex(mutex_name)
    fallback_url = f"http://{HOST}:{default_port}"

    if already_running:
        # Ya hay una instancia corriendo o arrancando — ignorar este click.
        # La instancia primaria se encarga de abrir el navegador cuando esté lista.
        return

    port = _encontrar_puerto_libre(default_port)
    url = f"http://{HOST}:{port}"
    _guardar_state(app_id, url)

    splash = StartupSplash(splash_title, splash_subtitle)
    splash.start()
    threading.Thread(
        target=_esperar_servidor_y_abrir,
        args=(url, splash),
        daemon=True,
    ).start()

    try:
        uvicorn.run(app, host=HOST, port=port)
    finally:
        splash.close()
        _limpiar_state(app_id)
        if mutex_handle:
            try:
                ctypes.windll.kernel32.ReleaseMutex(mutex_handle)
                ctypes.windll.kernel32.CloseHandle(mutex_handle)
            except Exception:
                pass
