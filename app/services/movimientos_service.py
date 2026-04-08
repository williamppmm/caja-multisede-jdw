from datetime import date, datetime

from app.models.caja_models import MovimientoEntrada
from app.services import excel_service, nombres_service


def guardar_movimiento(entrada: MovimientoEntrada) -> dict:
    hoy = date.today()
    if entrada.fecha != hoy and not entrada.forzar:
        return {
            "ok": False,
            "mensaje": "Solo puedes guardar movimientos en la fecha actual. Para corregir otra fecha necesitas admin.",
            "fecha": str(entrada.fecha),
        }

    timestamp = datetime.now().replace(microsecond=0)
    try:
        resumen = excel_service.guardar_movimiento_registro(
            entrada.fecha,
            entrada.tipo_movimiento,
            entrada.concepto,
            entrada.valor,
            entrada.observacion,
            timestamp,
        )
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}

    return {
        "ok": True,
        "mensaje": "Movimiento guardado correctamente",
        "fecha": str(entrada.fecha),
        "tipo_movimiento": entrada.tipo_movimiento,
        "concepto": entrada.concepto,
        "valor": float(entrada.valor),
        "observacion": entrada.observacion,
        "total_ingresos": resumen["total_ingresos"],
        "total_salidas": resumen["total_salidas"],
        "neto": resumen["neto"],
        "fecha_hora_registro": timestamp.isoformat(),
    }


def obtener_registros(fecha: date) -> dict:
    items = excel_service.obtener_movimientos_fecha(fecha, fecha.year)
    total_ingresos = sum(float(item["valor"] or 0) for item in items if item["tipo_movimiento"] == "ingreso")
    total_salidas = sum(float(item["valor"] or 0) for item in items if item["tipo_movimiento"] == "salida")
    return {
        "items": items,
        "total_ingresos": total_ingresos,
        "total_salidas": total_salidas,
        "neto": total_ingresos - total_salidas,
    }
