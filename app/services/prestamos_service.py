from datetime import date, datetime

from app.models.caja_models import PrestamoEntrada
from app.services import excel_service, nombres_service


def guardar_prestamo(entrada: PrestamoEntrada) -> dict:
    hoy = date.today()
    if entrada.fecha != hoy and not entrada.forzar:
        return {
            "ok": False,
            "mensaje": "Solo puedes registrar movimientos de prestamos en la fecha actual. Para corregir otra fecha necesitas admin.",
            "fecha": str(entrada.fecha),
        }

    persona = entrada.persona.strip()
    tipo = entrada.tipo_movimiento
    valor = float(entrada.valor)
    resumen_actual = excel_service.obtener_resumen_prestamos(persona=persona)
    saldo_actual = float(resumen_actual["saldo_pendiente"])

    if tipo == "pago" and valor > saldo_actual:
        return {
            "ok": False,
            "mensaje": f"El pago supera el saldo pendiente de {persona}. Saldo actual: {int(saldo_actual):,}".replace(",", "."),
            "fecha": str(entrada.fecha),
        }

    try:
        timestamp = datetime.now().replace(microsecond=0)
        excel_service.guardar_prestamo_registro(
            entrada.fecha,
            persona,
            tipo,
            valor,
            timestamp,
        )
        if tipo == "pago":
            resumen = {
                "total_prestado": float(resumen_actual["total_prestado"]),
                "total_pagado": float(resumen_actual["total_pagado"]) + valor,
                "saldo_pendiente": float(resumen_actual["saldo_pendiente"]) - valor,
            }
        else:
            resumen = {
                "total_prestado": float(resumen_actual["total_prestado"]) + valor,
                "total_pagado": float(resumen_actual["total_pagado"]),
                "saldo_pendiente": float(resumen_actual["saldo_pendiente"]) + valor,
            }
        nombres_service.agregar_item_catalogo("prestamos", persona)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}

    mensaje = "Préstamo registrado correctamente" if tipo == "prestamo" else "Pago registrado correctamente"
    return {
        "ok": True,
        "mensaje": mensaje,
        "fecha": str(entrada.fecha),
        "persona": persona,
        "tipo_movimiento": tipo,
        "valor": valor,
        "total_prestado": resumen["total_prestado"],
        "total_pagado": resumen["total_pagado"],
        "saldo_pendiente": resumen["saldo_pendiente"],
        "fecha_hora_registro": timestamp.isoformat(),
    }


def obtener_registros(fecha: date) -> dict:
    items = excel_service.obtener_prestamos_fecha(fecha, fecha.year)
    total_prestado = sum(float(item["valor"] or 0) for item in items if item["tipo_movimiento"] == "prestamo")
    total_pagado = sum(float(item["valor"] or 0) for item in items if item["tipo_movimiento"] == "pago")
    return {
        "items": items,
        "total_prestado": total_prestado,
        "total_pagado": total_pagado,
        "saldo_pendiente": total_prestado - total_pagado,
    }


def actualizar_prestamo_por_ts(fecha: date, ts_str: str, persona: str, tipo_movimiento: str, valor: float) -> dict:
    try:
        timestamp = datetime.now().replace(microsecond=0)
        resumen = excel_service.actualizar_prestamo_por_ts(fecha, fecha.year, ts_str, persona.strip(), tipo_movimiento, valor, timestamp)
        if resumen is None:
            return {"ok": False, "mensaje": "Registro no encontrado.", "fecha": str(fecha)}
        nombres_service.agregar_item_catalogo("prestamos", persona)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}

    mensaje = "Préstamo actualizado correctamente" if tipo_movimiento == "prestamo" else "Pago actualizado correctamente"
    return {
        "ok": True,
        "mensaje": mensaje,
        "fecha": str(fecha),
        "persona": persona.strip(),
        "tipo_movimiento": tipo_movimiento,
        "valor": valor,
        "total_prestado": resumen["total_prestado"],
        "total_pagado": resumen["total_pagado"],
        "saldo_pendiente": resumen["saldo_pendiente"],
        "fecha_hora_registro": timestamp.isoformat(),
    }


def eliminar_prestamo_por_ts(fecha: date, ts_str: str) -> dict:
    try:
        resumen = excel_service.eliminar_prestamo_por_ts(fecha, fecha.year, ts_str)
        if resumen is None:
            return {"ok": False, "mensaje": "Registro no encontrado.", "fecha": str(fecha)}
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}

    return {
        "ok": True,
        "mensaje": "Movimiento de préstamo eliminado correctamente",
        "fecha": str(fecha),
        "persona": "",
        "tipo_movimiento": "",
        "valor": 0,
        "total_prestado": resumen["total_prestado"],
        "total_pagado": resumen["total_pagado"],
        "saldo_pendiente": resumen["saldo_pendiente"],
        "fecha_hora_registro": datetime.now().replace(microsecond=0).isoformat(),
    }
