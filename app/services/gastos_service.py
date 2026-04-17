from datetime import date, datetime

from app.models.caja_models import ModuloItemsEntrada
from app.services import excel_service, nombres_service


def _sincronizar_cuadre(resultado: dict, fecha: date) -> dict:
    from app.services import cuadre_service
    sync = cuadre_service.sincronizar_cuadre_afectado(fecha)
    if sync is None:
        return resultado
    fecha_fmt = fecha.strftime("%d-%m-%Y")
    if sync.get("ok"):
        resultado["mensaje"] += f". Tus cambios han afectado el Cuadre del {fecha_fmt}"
    else:
        resultado["mensaje"] += ". Tus cambios podrían no reflejarse en el Cuadre de inmediato"
    return resultado


def actualizar_ultimo_gasto(entrada: ModuloItemsEntrada) -> dict:
    if not entrada.items:
        return {"ok": False, "mensaje": "Debes enviar un gasto para actualizar.", "fecha": str(entrada.fecha)}

    item = entrada.items[0]
    concepto = item.concepto.strip()
    valor = float(item.valor)

    try:
        timestamp = datetime.now().replace(microsecond=0)
        resumen = excel_service.actualizar_ultimo_gasto(entrada.fecha, entrada.fecha.year, concepto, valor, timestamp)
        if resumen is None:
            return {"ok": False, "mensaje": "No hay un último gasto para corregir.", "fecha": str(entrada.fecha)}
        nombres_service.agregar_item_catalogo("gastos", concepto)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}

    return _sincronizar_cuadre({
        "ok": True,
        "mensaje": "Último gasto actualizado correctamente",
        "fecha": str(entrada.fecha),
        "total": float(resumen.get("total", 0) or 0),
        "cantidad_items": len(resumen.get("items", [])),
        "fecha_hora_registro": timestamp.isoformat(),
    }, entrada.fecha)


def eliminar_ultimo_gasto(fecha: date) -> dict:
    try:
        resumen = excel_service.eliminar_ultimo_gasto(fecha, fecha.year)
        if resumen is None:
            return {"ok": False, "mensaje": "No hay un último gasto para eliminar.", "fecha": str(fecha)}
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}

    return _sincronizar_cuadre({
        "ok": True,
        "mensaje": "Último gasto eliminado correctamente",
        "fecha": str(fecha),
        "total": float(resumen.get("total", 0) or 0),
        "cantidad_items": len(resumen.get("items", [])),
        "fecha_hora_registro": datetime.now().replace(microsecond=0).isoformat(),
    }, fecha)
