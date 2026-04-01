from datetime import date

from fastapi import APIRouter, HTTPException

from app.models.caja_models import (
    BonoEntrada,
    BonoRespuesta,
    CajaEntrada,
    CajaRespuesta,
    ModuloItemsEntrada,
    ModuloItemsRespuesta,
)
from app.services import bonos_service, caja_service, excel_service, nombres_service, settings_service

router = APIRouter(prefix="/api/modulos")


@router.post("/caja/guardar", response_model=CajaRespuesta)
def guardar_caja(entrada: CajaEntrada):
    resultado = caja_service.guardar_caja(entrada)
    return CajaRespuesta(**resultado)


@router.get("/caja/fecha/{fecha}/datos")
def datos_fecha_caja(fecha: str):
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    datos = excel_service.obtener_datos_caja_fecha(d, d.year)
    if datos is None:
        raise HTTPException(status_code=404, detail="No hay datos para esa fecha")
    return datos


@router.post("/{modulo}/guardar", response_model=ModuloItemsRespuesta)
def guardar_modulo_items(modulo: str, entrada: ModuloItemsEntrada):
    if modulo not in {"gastos"}:
        raise HTTPException(status_code=404, detail="Modulo no soportado")
    resultado = caja_service.guardar_items_modulo(modulo, entrada)
    return ModuloItemsRespuesta(**resultado)


@router.post("/bonos/registrar", response_model=BonoRespuesta)
def registrar_bono(entrada: BonoEntrada):
    resultado = bonos_service.guardar_bono(entrada)
    return BonoRespuesta(**resultado)


@router.get("/bonos/fecha/{fecha}/datos")
def datos_fecha_bonos(fecha: str):
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    return bonos_service.obtener_registros(d)


@router.get("/{modulo}/fecha/{fecha}/datos")
def datos_fecha_modulo(modulo: str, fecha: str):
    if modulo not in {"gastos"}:
        raise HTTPException(status_code=404, detail="Modulo no soportado")
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    datos = excel_service.obtener_items_modulo_fecha(modulo, d, d.year)
    if datos is None:
        raise HTTPException(status_code=404, detail="No hay datos para esa fecha")
    return datos


@router.get("/bonos/nombres")
def bonos_nombres():
    return {"nombres": nombres_service.obtener_nombres()}


@router.post("/bonos/nombres/importar")
def importar_nombres_bonos():
    selected = settings_service.select_text_file_dialog(settings_service.get_settings().get("data_dir"))
    if not selected:
        return {"ok": False, "cancelled": True}
    agregados = nombres_service.importar_desde_txt(selected)
    return {"ok": True, "agregados": agregados}


@router.post("/bonos/ultimo/editar", response_model=BonoRespuesta)
def editar_ultimo_bono(entrada: BonoEntrada):
    resultado = bonos_service.actualizar_ultimo_bono(entrada.fecha, entrada.cliente, entrada.valor)
    return BonoRespuesta(**resultado)


@router.post("/bonos/ultimo/eliminar")
def eliminar_ultimo_bono(body: dict):
    fecha_raw = body.get("fecha")
    try:
        d = date.fromisoformat(str(fecha_raw))
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    return bonos_service.eliminar_ultimo_bono(d)


@router.get("/{modulo}/fecha/{fecha}/estado")
def consultar_fecha_modulo(modulo: str, fecha: str):
    if modulo not in {"caja", "gastos", "bonos"}:
        raise HTTPException(status_code=404, detail="Modulo no soportado")
    try:
        return caja_service.consultar_estado_modulo(modulo, fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")


@router.get("/{modulo}/ultima")
def ultima_modulo(modulo: str):
    if modulo not in {"caja", "gastos", "bonos"}:
        raise HTTPException(status_code=404, detail="Modulo no soportado")
    year = date.today().year
    ultima_fecha = excel_service.obtener_ultima_fecha_modulo(modulo, year)
    if ultima_fecha is None:
        return {"fecha": None, "mensaje": "Sin registros este año"}
    return {"fecha": str(ultima_fecha)}
