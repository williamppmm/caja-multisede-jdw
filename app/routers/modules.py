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
    PlataformasEntrada,
    PlataformasRespuesta,
    PrestamoEntrada,
    PrestamoRespuesta,
)
from app.models.contadores_models import ContadoresEntrada, ContadoresRespuesta
from app.models.cuadre_models import CuadreEntrada, CuadreRespuesta
from app.services import bonos_service, caja_service, contadores_service, cuadre_service, excel_service, gastos_service, movimientos_service, nombres_service, prestamos_service, settings_service

router = APIRouter(prefix="/api/modulos")


@router.post("/caja/guardar", response_model=CajaRespuesta)
def guardar_caja(entrada: CajaEntrada):
    resultado = caja_service.guardar_caja(entrada)
    return CajaRespuesta(**resultado)


@router.post("/plataformas/guardar", response_model=PlataformasRespuesta)
def guardar_plataformas(entrada: PlataformasEntrada):
    resultado = caja_service.guardar_plataformas(entrada)
    return PlataformasRespuesta(**resultado)


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


@router.get("/plataformas/fecha/{fecha}/datos")
def datos_fecha_plataformas(fecha: str):
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    datos = excel_service.obtener_datos_plataformas_fecha(d, d.year)
    if datos is None:
        raise HTTPException(status_code=404, detail="No hay datos para esa fecha")
    return datos


@router.post("/cuadre/guardar", response_model=CuadreRespuesta)
def guardar_cuadre_pre(entrada: CuadreEntrada):
    preconds = cuadre_service.verificar_precondiciones(entrada.fecha)
    if not preconds["ok"]:
        return CuadreRespuesta(ok=False, mensaje=preconds["mensaje"], fecha=str(entrada.fecha))
    base = preconds["base_anterior"] if preconds["tiene_base_anterior"] else entrada.base_anterior
    resultado = cuadre_service.guardar_cuadre(entrada, base)
    return CuadreRespuesta(**resultado)


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


@router.get("/cuadre/fecha/{fecha}/estado")
def estado_cuadre(fecha: str):
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    existe = excel_service.fecha_existe_modulo("cuadre", d, d.year)
    preconds = cuadre_service.verificar_precondiciones(d)
    return {"fecha": fecha, "existe": existe, "requiere_admin": existe, **preconds}


@router.get("/cuadre/calcular/{fecha}")
def calcular_cuadre_fecha(fecha: str):
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    preconds = cuadre_service.verificar_precondiciones(d)
    base = preconds["base_anterior"] if preconds["tiene_base_anterior"] else 0.0
    datos = cuadre_service.calcular_cuadre(d, base)
    return {"ok": True, **preconds, **datos}


@router.get("/cuadre/fecha/{fecha}/datos")
def datos_fecha_cuadre(fecha: str):
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    datos = excel_service.obtener_datos_cuadre_fecha(d, d.year)
    if datos is None:
        raise HTTPException(status_code=404, detail="No hay Cuadre guardado para esa fecha")
    return datos


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
    total_prestado = sum(float(item["valor"] or 0) for item in registros if item.get("tipo_movimiento") == "prestamo")
    total_pagado = sum(float(item["valor"] or 0) for item in registros if item.get("tipo_movimiento") == "pago")
    return {
        "items": registros,
        "total": sum(float(item["valor"] or 0) for item in registros),
        "total_prestado": total_prestado,
        "total_pagado": total_pagado,
        "saldo_pendiente": total_prestado - total_pagado,
    }


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


@router.post("/gastos/ultimo/editar", response_model=ModuloItemsRespuesta)
def editar_ultimo_gasto(entrada: ModuloItemsEntrada):
    resultado = gastos_service.actualizar_ultimo_gasto(entrada)
    return ModuloItemsRespuesta(**resultado)


@router.post("/gastos/ultimo/eliminar")
def eliminar_ultimo_gasto(body: dict):
    fecha_raw = body.get("fecha")
    try:
        d = date.fromisoformat(str(fecha_raw))
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    return gastos_service.eliminar_ultimo_gasto(d)


@router.post("/prestamos/ultimo/editar", response_model=PrestamoRespuesta)
def editar_ultimo_prestamo(entrada: PrestamoEntrada):
    resultado = prestamos_service.actualizar_ultimo_prestamo(entrada)
    return PrestamoRespuesta(**resultado)


@router.post("/prestamos/ultimo/eliminar")
def eliminar_ultimo_prestamo(body: dict):
    fecha_raw = body.get("fecha")
    try:
        d = date.fromisoformat(str(fecha_raw))
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    return prestamos_service.eliminar_ultimo_prestamo(d)


@router.post("/movimientos/ultimo/editar", response_model=MovimientoRespuesta)
def editar_ultimo_movimiento(entrada: MovimientoEntrada):
    resultado = movimientos_service.actualizar_ultimo_movimiento(entrada)
    return MovimientoRespuesta(**resultado)


@router.post("/movimientos/ultimo/eliminar")
def eliminar_ultimo_movimiento(body: dict):
    fecha_raw = body.get("fecha")
    try:
        d = date.fromisoformat(str(fecha_raw))
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    return movimientos_service.eliminar_ultimo_movimiento(d)


@router.get("/{modulo}/fecha/{fecha}/estado")
def consultar_fecha_modulo(modulo: str, fecha: str):
    if modulo not in {"caja", "plataformas", "gastos", "bonos", "prestamos", "movimientos", "contadores", "cuadre"}:
        raise HTTPException(status_code=404, detail="Modulo no soportado")
    try:
        if modulo == "cuadre":
            existe = excel_service.fecha_existe_modulo("cuadre", date.fromisoformat(fecha), date.fromisoformat(fecha).year)
            preconds = cuadre_service.verificar_precondiciones(date.fromisoformat(fecha))
            return {"fecha": fecha, "existe": existe, "requiere_admin": existe, **preconds}
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
    if modulo not in {"caja", "plataformas", "gastos", "bonos", "prestamos", "movimientos", "contadores", "cuadre"}:
        raise HTTPException(status_code=404, detail="Modulo no soportado")
    if modulo == "contadores":
        ultima_fecha = contadores_service.obtener_ultima_fecha()
        if ultima_fecha is None:
            return {"fecha": None, "mensaje": "Sin registros en Contadores"}
        return {"fecha": str(ultima_fecha)}
    if modulo == "cuadre":
        ultima_fecha = cuadre_service.obtener_ultima_fecha_cuadre()
        if ultima_fecha is None:
            return {"fecha": None, "mensaje": "Sin cuadres registrados"}
        return {"fecha": str(ultima_fecha)}
    ultima_fecha = excel_service.obtener_ultima_fecha_modulo_global(modulo)
    if ultima_fecha is None:
        return {"fecha": None, "mensaje": "Sin registros"}
    return {"fecha": str(ultima_fecha)}
