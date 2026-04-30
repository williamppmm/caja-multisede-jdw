import os
import sys
import threading
import time

from fastapi import APIRouter

from app.services import excel_service, settings_service, startup_state_service

router = APIRouter()

# ── Heartbeat ────────────────────────────────────────────────────────────────
# El navegador envía POST /api/app/heartbeat cada ~30 s.
# Si no llega ninguno en HEARTBEAT_TIMEOUT segundos, el servidor se apaga solo.
# Esto cubre el caso en que el usuario cierra el navegador sin usar "Finalizar".
#
# Nota importante:
# Esta versión sigue usando una salida forzada como último recurso para evitar
# procesos zombie cuando el navegador desaparece sin cerrar la app de forma
# normal. La encapsulamos para que quede explícito que es una decisión
# operativa y no un cierre abrupto accidental.

HEARTBEAT_TIMEOUT = 12 * 60 * 60  # 12 horas sin heartbeat → apagar
_last_heartbeat = time.monotonic()
_heartbeat_started = False
_heartbeat_lock = threading.Lock()


def _salida_forzada_app(motivo: str) -> None:
    try:
        sys.stdout.flush()
    except Exception:
        pass
    try:
        sys.stderr.flush()
    except Exception:
        pass
    os._exit(0)


def _watchdog():
    while True:
        time.sleep(10)
        with _heartbeat_lock:
            elapsed = time.monotonic() - _last_heartbeat
        if elapsed > HEARTBEAT_TIMEOUT:
            _salida_forzada_app("watchdog")


def _iniciar_watchdog():
    global _heartbeat_started
    with _heartbeat_lock:
        if _heartbeat_started:
            return
        _heartbeat_started = True
    t = threading.Thread(target=_watchdog, daemon=True)
    t.start()


# ── Rutas ────────────────────────────────────────────────────────────────────

@router.get("/api/settings")
def get_settings():
    return {
        **settings_service.get_settings(),
        "hojas_activas": excel_service.obtener_hojas_activas(),
    }


@router.post("/api/settings")
def post_settings(body: dict):
    settings_service.save_settings(body)
    return {"ok": True}


@router.get("/api/settings/startup")
def get_startup_settings():
    return startup_state_service.get_startup_state()


@router.post("/api/settings/startup")
def post_startup_settings(body: dict):
    state = startup_state_service.save_startup_state(body or {})
    return {"ok": True, **state}


@router.post("/api/settings/browse-directory")
def browse_directory():
    settings = settings_service.get_settings()
    selected = settings_service.select_directory_dialog(settings.get("data_dir"))
    if not selected:
        return {"ok": False, "cancelled": True}
    return {"ok": True, "data_dir": selected}


@router.post("/api/app/heartbeat")
def heartbeat():
    global _last_heartbeat
    with _heartbeat_lock:
        _last_heartbeat = time.monotonic()
    _iniciar_watchdog()
    return {"ok": True}


@router.post("/api/app/shutdown")
def shutdown_app():
    threading.Timer(0.3, _salida_forzada_app, args=("shutdown",)).start()
    return {"ok": True}
