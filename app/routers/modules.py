from datetime import date

from fastapi import APIRouter, HTTPException

from app.models.caja_models import (
    BonoEntrada,
    BonoRespuesta,
    CajaEntrada,
    CajaRespuesta,
    ModuloItemsEntrada,
    ModuloItemsRespuesta,
    MovimientoEntrada,
    MovimientoRespuesta,
    PrestamoEntrada,
    PrestamoRespuesta,
)
from app.models.contadores_models import ContadoresEntrada, ContadoresRespuesta
from app.services import bonos_service, caja_service, contadores_service, excel_service, movimientos_service, nombres_service, prestamos_service, settings_service

router = APIRouter(prefix="/api/modulos")


@router.post("/caja/guardar", response_model=CajaRespuesta)
def guardar_caja(entrada: CajaEntrada):
    resultado = caja_service.guardar_caja(entrada)
    return CajaRespuesta(**resultado)


@router.post("/contadores/guardar", response_model=ContadoresRespuesta)
def guardar_contadores(entrada: ContadoresEntrada):
    resultado = contadores_service.guardar_contadores(entrada)
    return ContadoresRespuesta(**resultado)


@router.get("/contadores/fecha/{fecha}/datos")
def datos_fecha_contadores(fecha: str):
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    return contadores_service.construir_base_fecha(d)


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


@router.post("/prestamos/registrar", response_model=PrestamoRespuesta)
def registrar_prestamo(entrada: PrestamoEntrada):
    resultado = prestamos_service.guardar_prestamo(entrada)
    return PrestamoRespuesta(**resultado)


@router.post("/movimientos/registrar", response_model=MovimientoRespuesta)
def registrar_movimiento(entrada: MovimientoEntrada):
    resultado = movimientos_service.guardar_movimiento(entrada)
    return MovimientoRespuesta(**resultado)


@router.get("/prestamos/datos")
def datos_prestamos():
    return prestamos_service.obtener_registros()


@router.get("/bonos/fecha/{fecha}/datos")
def datos_fecha_bonos(fecha: str):
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    return bonos_service.obtener_registros(d)


@router.get("/prestamos/fecha/{fecha}/datos")
def datos_fecha_prestamos(fecha: str):
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    registros = excel_service.obtener_prestamos_fecha(d, d.year)
    if not registros:
        raise HTTPException(status_code=404, detail="No hay datos para esa fecha")
    return {"items": registros, "total": sum(item["valor"] for item in registros)}


@router.get("/movimientos/fecha/{fecha}/datos")
def datos_fecha_movimientos(fecha: str):
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    datos = movimientos_service.obtener_registros(d)
    if not datos["items"]:
        raise HTTPException(status_code=404, detail="No hay datos para esa fecha")
    return datos


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


@router.get("/gastos/conceptos")
def gastos_conceptos():
    return {"conceptos": nombres_service.obtener_catalogo("gastos")}


@router.get("/prestamos/personas")
def prestamos_personas():
    return {"personas": nombres_service.obtener_catalogo("prestamos")}


@router.get("/movimientos/conceptos")
def movimientos_conceptos():
    return {"conceptos": nombres_service.obtener_catalogo("movimientos")}


@router.post("/bonos/nombres/importar")
def importar_nombres_bonos():
    selected = settings_service.select_text_file_dialog(settings_service.get_settings().get("data_dir"))
    if not selected:
        return {"ok": False, "cancelled": True}
    agregados = nombres_service.importar_desde_txt(selected)
    return {"ok": True, "agregados": agregados}


@router.get("/catalogos/{tipo}")
def obtener_catalogo(tipo: str):
    if tipo not in {"bonos", "gastos", "prestamos", "movimientos", "contadores"}:
        raise HTTPException(status_code=404, detail="Catalogo no soportado")
    if tipo == "contadores":
        return {"items": contadores_service.obtener_catalogo()}
    key = "nombres" if tipo in {"bonos", "prestamos"} else "conceptos"
    return {key: nombres_service.obtener_catalogo(tipo)}


@router.post("/catalogos/{tipo}")
def guardar_catalogo(tipo: str, body: dict):
    if tipo not in {"bonos", "gastos", "prestamos", "movimientos", "contadores"}:
        raise HTTPException(status_code=404, detail="Catalogo no soportado")
    items = body.get("items")
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="El cuerpo debe incluir una lista en 'items'.")
    if tipo == "contadores":
        resultado = contadores_service.guardar_catalogo(items)
        return {"ok": True, "items": resultado, "total": len(resultado)}
    nombres_service.guardar_catalogo(tipo, items)
    key = "nombres" if tipo in {"bonos", "prestamos"} else "conceptos"
    resultado = nombres_service.obtener_catalogo(tipo)
    return {"ok": True, key: resultado, "total": len(resultado)}


@router.post("/contadores/catalogo/{item_id}/pausar")
def pausar_contador(item_id: str, body: dict):
    pausado = bool(body.get("pausado", True))
    return contadores_service.pausar_item(item_id, pausado)


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
    if modulo not in {"caja", "gastos", "bonos", "prestamos", "movimientos", "contadores"}:
        raise HTTPException(status_code=404, detail="Modulo no soportado")
    try:
        if modulo == "contadores":
            existe = contadores_service.fecha_existe(date.fromisoformat(fecha))
            return {
                "fecha": fecha,
                "existe": existe,
                "requiere_admin": existe,
                "editable_libre": not existe,
            }
        return caja_service.consultar_estado_modulo(modulo, fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")


@router.get("/{modulo}/ultima")
def ultima_modulo(modulo: str):
    if modulo not in {"caja", "gastos", "bonos", "prestamos", "movimientos", "contadores"}:
        raise HTTPException(status_code=404, detail="Modulo no soportado")
    if modulo == "contadores":
        ultima_fecha = contadores_service.obtener_ultima_fecha()
        if ultima_fecha is None:
            return {"fecha": None, "mensaje": "Sin registros en Contadores"}
        return {"fecha": str(ultima_fecha)}
    year = date.today().year
    ultima_fecha = excel_service.obtener_ultima_fecha_modulo(modulo, year)
    if ultima_fecha is None:
        return {"fecha": None, "mensaje": "Sin registros este año"}
    return {"fecha": str(ultima_fecha)}
