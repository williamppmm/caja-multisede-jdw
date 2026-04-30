import os
import sys
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
#
# Nota importante:
# El proceso de escritorio corre Uvicorn embebido y, en ciertos cierres del
# navegador, no siempre tenemos una señal de apagado limpia. Por eso se usa una
# salida forzada como último recurso para evitar procesos zombie. La mantenemos
# encapsulada en un helper para dejar explícito que es una decisión operativa,
# no un olvido accidental.

HEARTBEAT_TIMEOUT = 60 * 60  # 1 hora sin heartbeat → apagar
_last_heartbeat = time.monotonic()
_heartbeat_started = False
_heartbeat_lock = threading.Lock()


def _salida_forzada_app(motivo: str) -> None:
    """Termina el proceso como último recurso.

    Se intentan flushes best-effort antes de salir para reducir el riesgo de
    perder trazas recientes, pero el cierre sigue siendo forzado para asegurar
    que no queden procesos huérfanos cuando el frontend desaparece.
    """
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
    # Si backup quedó habilitado con carpeta configurada, disparar un intento inmediato
    # en background para no esperar la siguiente pasada del loop (hasta 4 h).
    if settings_service.is_super_admin_build():
        s = settings_service.get_settings()
        if s.get("backup_enabled") and s.get("backup_root"):
            from app.services import backup_service
            threading.Thread(target=backup_service._run_con_lock, daemon=True).start()
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
    try:
        row = int(body.get("row")) if body.get("row") is not None else None
    except Exception:
        row = None

    if modulo not in excel_service.SECTION_PREFIXES:
        return {"ok": False, "mensaje": "Módulo no válido."}

    path = excel_service._path_modulo(modulo, year)
    hoja = excel_service._obtener_nombre_hoja_seccion(modulo)
    return settings_service.abrir_xlsx_en_hoja(path, hoja, row)


# ── Respaldos automáticos (solo super admin) ─────────────────────────────────

@router.get("/api/backup/status")
def backup_status():
    from app.services import backup_service
    s = settings_service.get_settings()
    backup_root = str(s.get("backup_root") or "").strip()
    if not backup_root:
        return {"ok": True, "log": [], "backup_root": ""}
    return {
        "ok": True,
        "backup_root": backup_root,
        "log": backup_service.leer_ultimo_log(backup_root),
    }


@router.post("/api/backup/run-now")
def backup_run_now():
    from app.services import backup_service
    if not settings_service.is_super_admin_build():
        return {"ok": False, "mensaje": "Solo disponible en super admin."}
    resultados = backup_service.ejecutar_backup()
    if not resultados:
        return {"ok": False, "mensaje": "Backup no ejecutado. Verifica que esté habilitado y tenga carpeta destino configurada."}
    validos = sum(1 for r in resultados if r.get("valido"))
    return {"ok": True, "resultados": resultados, "resumen": f"{validos}/{len(resultados)} sedes respaldadas correctamente."}


@router.post("/api/backup/validate-root")
def backup_validate_root(body: dict):
    from app.services import backup_service
    return backup_service.validar_backup_root(str(body.get("ruta", "")))


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
