from fastapi import APIRouter

from app.services import diferencias_service

router = APIRouter(prefix="/api/diferencias")


@router.get("/panel")
def obtener_panel_diferencias():
    return diferencias_service.obtener_panel_diferencias_actual()
