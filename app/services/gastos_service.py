from datetime import date, datetime

from app.services import cuadre_service, excel_service, nombres_service


def obtener_registros_completos(fecha: date) -> dict:
    items = excel_service.obtener_gastos_fecha(fecha, fecha.year)
    return {"items": items, "total": sum(float(item["valor"] or 0) for item in items)}


def actualizar_gasto_por_ts(fecha: date, ts_str: str, concepto: str, valor: float) -> dict:
    try:
        timestamp = datetime.now().replace(microsecond=0)
        result = excel_service.actualizar_gasto_por_ts(fecha, fecha.year, ts_str, concepto.strip(), valor, timestamp)
        if result is None:
            return {"ok": False, "mensaje": "Registro no encontrado.", "fecha": str(fecha)}
        nombres_service.agregar_item_catalogo("gastos", concepto)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}

    sync_result = cuadre_service.sincronizar_cuadre_afectado(fecha)

    return {
        "ok": True,
        "mensaje": cuadre_service.anexar_mensaje_sync("Gasto actualizado correctamente", sync_result),
        "fecha": str(fecha),
        "concepto": concepto.strip(),
        "valor": valor,
        "total": result["total_dia"],
        "fecha_hora_registro": timestamp.isoformat(),
    }


def eliminar_gasto_por_ts(fecha: date, ts_str: str) -> dict:
    try:
        result = excel_service.eliminar_gasto_por_ts(fecha, fecha.year, ts_str)
        if result is None:
            return {"ok": False, "mensaje": "Registro no encontrado.", "fecha": str(fecha)}
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}

    sync_result = cuadre_service.sincronizar_cuadre_afectado(fecha)

    return {
        "ok": True,
        "mensaje": cuadre_service.anexar_mensaje_sync("Gasto eliminado correctamente", sync_result),
        "fecha": str(fecha),
        "total": result["total_dia"],
        "fecha_hora_registro": datetime.now().replace(microsecond=0).isoformat(),
    }
