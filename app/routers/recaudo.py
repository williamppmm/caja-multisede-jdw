from datetime import date

from fastapi import APIRouter, HTTPException

from app.services import recaudo_service

router = APIRouter(prefix="/api/recaudo")


@router.get("")
def get_recaudo(fecha: str | None = None):
    fecha_corte = None
    if fecha:
        try:
            fecha_corte = date.fromisoformat(fecha)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    return recaudo_service.get_recaudo_resumen(fecha_corte)


@router.post("/registrar-entrega")
def registrar_entrega(body: dict):
    fecha_raw = str(body.get("fecha") or "").strip()
    try:
        fecha = date.fromisoformat(fecha_raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")

    monto = float(body.get("monto") or 0)
    nota = str(body.get("nota") or "").strip()
    resultado = recaudo_service.registrar_entrega(fecha, monto, nota)
    if not resultado.get("ok"):
        raise HTTPException(status_code=400, detail=resultado.get("mensaje") or "No se pudo registrar la entrega.")
    return resultado


@router.post("/cerrar-ciclo")
def cerrar_ciclo(body: dict | None = None):
    body = body or {}
    fecha_raw = str(body.get("fecha") or "").strip()
    fecha = None
    if fecha_raw:
        try:
            fecha = date.fromisoformat(fecha_raw)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")

    resultado = recaudo_service.cerrar_ciclo(fecha)
    if not resultado.get("ok"):
        raise HTTPException(status_code=400, detail=resultado.get("mensaje") or "No se pudo cerrar el ciclo.")
    return resultado
