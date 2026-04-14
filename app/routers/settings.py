import os
import threading
import time
from datetime import date

from fastapi import APIRouter

from app.services import excel_service, settings_service, startup_state_service

router = APIRouter()

# ── Heartbeat ────────────────────────────────────────────────────────────────
# El navegador envía POST /api/app/heartbeat cada ~30 s.
# Si no llega ninguno en HEARTBEAT_TIMEOUT segundos, el servidor se apaga solo.
# Esto cubre el caso en que el usuario cierra el navegador sin usar "Finalizar".

HEARTBEAT_TIMEOUT = 75  # segundos sin heartbeat → apagar
_last_heartbeat = time.monotonic()
_heartbeat_started = False
_heartbeat_lock = threading.Lock()


def _watchdog():
    while True:
        time.sleep(10)
        with _heartbeat_lock:
            elapsed = time.monotonic() - _last_heartbeat
        if elapsed > HEARTBEAT_TIMEOUT:
            os._exit(0)


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
    s = settings_service.get_settings()
    return {
        **s,
        "hojas_activas": excel_service.obtener_hojas_activas(),
        "active_site": settings_service.get_active_site(),
        "is_super_admin_build": settings_service.is_super_admin_build(),
    }


@router.post("/api/settings")
def post_settings(body: dict):
    settings_service.save_settings(body)
    return {"ok": True, "active_site": settings_service.get_active_site()}


# ── Sedes remotas (super admin) ───────────────────────────────────────────────

@router.get("/api/settings/remote-sites")
def get_remote_sites():
    return {"sites": settings_service.get_remote_sites()}


@router.post("/api/settings/remote-sites")
def post_remote_sites(body: dict):
    sites = settings_service.save_remote_sites(body.get("sites", []))
    return {"ok": True, "sites": sites, "active_site": settings_service.get_active_site()}


@router.post("/api/settings/active-site")
def post_active_site(body: dict):
    result = settings_service.set_active_site(str(body.get("site_id", "")))
    return result


@router.post("/api/settings/remote-sites/validate")
def validate_remote_site(body: dict):
    return settings_service.validate_remote_site(str(body.get("data_dir", "")))


@router.post("/api/settings/remote-sites/browse")
def browse_remote_site():
    settings = settings_service.get_settings()
    selected = settings_service.select_directory_dialog(settings.get("data_dir"))
    if not selected:
        return {"ok": False, "cancelled": True}
    return {"ok": True, "data_dir": selected}


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


@router.post("/api/settings/open-module-xlsx")
def open_module_xlsx(body: dict):
    modulo = str(body.get("modulo", "caja") or "caja").strip().lower()
    try:
        year = int(body.get("year") or date.today().year)
    except Exception:
        year = date.today().year

    if modulo not in excel_service.SECTION_PREFIXES:
        return {"ok": False, "mensaje": "Módulo no válido."}

    path = excel_service._path_modulo(modulo, year)
    hoja = excel_service._obtener_nombre_hoja_seccion(modulo)
    return settings_service.abrir_xlsx_en_hoja(path, hoja)


@router.post("/api/app/heartbeat")
def heartbeat():
    global _last_heartbeat
    with _heartbeat_lock:
        _last_heartbeat = time.monotonic()
    _iniciar_watchdog()
    return {"ok": True}


@router.post("/api/app/shutdown")
def shutdown_app():
    threading.Timer(0.3, os._exit, args=(0,)).start()
    return {"ok": True}
