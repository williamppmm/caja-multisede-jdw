import os
import threading

from fastapi import APIRouter

from app.services import excel_service, settings_service, startup_state_service

router = APIRouter()


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


@router.post("/api/app/shutdown")
def shutdown_app():
    threading.Timer(0.3, os._exit, args=(0,)).start()
    return {"ok": True}
