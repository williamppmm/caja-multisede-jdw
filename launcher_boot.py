import ctypes
import json
import socket
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

from app.runtime_paths import get_web_dir
from app.services.local_data_service import get_local_data_path


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
    path.write_text(json.dumps({"url": url}, ensure_ascii=False), encoding="utf-8")


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
        self._cerrar = threading.Event()
        self._listo = threading.Event()
        self._thread = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self._listo.wait(2)

    def close(self) -> None:
        self._cerrar.set()

    def _run(self) -> None:
        try:
            import tkinter as tk
        except Exception:
            self._listo.set()
            return

        root = tk.Tk()
        root.title(self.titulo)
        root.resizable(False, False)
        root.configure(bg="#f4f7fb")
        root.geometry("360x170")
        root.attributes("-topmost", True)

        icon_path = get_web_dir() / "assets" / "favicon.ico"
        try:
            if icon_path.exists():
                root.iconbitmap(default=str(icon_path))
        except Exception:
            pass

        root.update_idletasks()
        w = root.winfo_width()
        h = root.winfo_height()
        x = (root.winfo_screenwidth() - w) // 2
        y = (root.winfo_screenheight() - h) // 2
        root.geometry(f"{w}x{h}+{x}+{y}")

        frame = tk.Frame(root, bg="#f4f7fb", padx=24, pady=22)
        frame.pack(fill="both", expand=True)

        badge = tk.Label(
            frame,
            text="W",
            font=("Segoe UI Semibold", 34),
            fg="#1e73d1",
            bg="#f4f7fb",
        )
        badge.pack(pady=(0, 6))

        title = tk.Label(
            frame,
            text=self.titulo,
            font=("Segoe UI Semibold", 14),
            fg="#16345f",
            bg="#f4f7fb",
        )
        title.pack()

        subtitle = tk.Label(
            frame,
            text=self.subtitulo,
            font=("Segoe UI", 9),
            fg="#5f6f86",
            bg="#f4f7fb",
        )
        subtitle.pack(pady=(6, 0))

        self._listo.set()

        def poll():
            if self._cerrar.is_set():
                try:
                    root.destroy()
                except Exception:
                    pass
                return
            root.after(120, poll)

        root.after(120, poll)
        try:
            root.mainloop()
        except Exception:
            pass


def _esperar_url_instancia(app_id: str, fallback_url: str, timeout_s: float = 10.0) -> str:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        url = _leer_state(app_id)
        if url:
            return url
        time.sleep(0.2)
    return fallback_url


def _esperar_servidor_y_abrir(url: str, splash: StartupSplash | None = None, timeout_s: float = 30.0) -> None:
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
        url = _esperar_url_instancia(app_id, fallback_url)
        _esperar_servidor_y_abrir(url)
        return

    port = _encontrar_puerto_libre(default_port)
    url = f"http://{HOST}:{port}"
    _guardar_state(app_id, url)

    splash = StartupSplash(splash_title, splash_subtitle)
    splash.start()
    threading.Thread(target=_esperar_servidor_y_abrir, args=(url, splash), daemon=True).start()

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
