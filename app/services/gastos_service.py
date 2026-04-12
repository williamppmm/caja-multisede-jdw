from datetime import date, datetime

from app.models.caja_models import ModuloItemsEntrada
from app.services import excel_service, nombres_service


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

    return {
        "ok": True,
        "mensaje": "Último gasto actualizado correctamente",
        "fecha": str(entrada.fecha),
        "total": float(resumen.get("total", 0) or 0),
        "cantidad_items": len(resumen.get("items", [])),
        "fecha_hora_registro": timestamp.isoformat(),
    }


def eliminar_ultimo_gasto(fecha: date) -> dict:
    try:
        resumen = excel_service.eliminar_ultimo_gasto(fecha, fecha.year)
        if resumen is None:
            return {"ok": False, "mensaje": "No hay un último gasto para eliminar.", "fecha": str(fecha)}
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}

    return {
        "ok": True,
        "mensaje": "Último gasto eliminado correctamente",
        "fecha": str(fecha),
        "total": float(resumen.get("total", 0) or 0),
        "cantidad_items": len(resumen.get("items", [])),
        "fecha_hora_registro": datetime.now().replace(microsecond=0).isoformat(),
    }
