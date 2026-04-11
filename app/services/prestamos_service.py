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
        resumen = excel_service.guardar_prestamo_registro(
            entrada.fecha,
            persona,
            tipo,
            valor,
            timestamp,
        )
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


def obtener_registros() -> dict:
    resumen = excel_service.obtener_resumen_prestamos()
    return resumen


def actualizar_ultimo_prestamo(entrada: PrestamoEntrada) -> dict:
    ultimo = excel_service.obtener_ultimo_prestamo(entrada.fecha, entrada.fecha.year)
    if ultimo is None:
        return {"ok": False, "mensaje": "No hay un último movimiento de préstamos para corregir.", "fecha": str(entrada.fecha)}

    persona = entrada.persona.strip()
    tipo = entrada.tipo_movimiento
    valor = float(entrada.valor)

    resumen_actual = excel_service.obtener_resumen_prestamos(persona=persona)
    saldo_ajustado = float(resumen_actual["saldo_pendiente"])
    if str(ultimo.get("persona", "")).strip().lower() == persona.lower():
        if ultimo.get("tipo_movimiento") == "pago":
            saldo_ajustado += float(ultimo.get("valor") or 0)
        else:
            saldo_ajustado -= float(ultimo.get("valor") or 0)

    if tipo == "pago" and valor > saldo_ajustado:
        return {
            "ok": False,
            "mensaje": f"El pago supera el saldo pendiente de {persona}. Saldo actual: {int(saldo_ajustado):,}".replace(",", "."),
            "fecha": str(entrada.fecha),
        }

    try:
        timestamp = datetime.now().replace(microsecond=0)
        resumen = excel_service.actualizar_ultimo_prestamo(
            entrada.fecha,
            entrada.fecha.year,
            persona,
            tipo,
            valor,
            timestamp,
        )
        if resumen is None:
            return {"ok": False, "mensaje": "No hay un último movimiento de préstamos para corregir.", "fecha": str(entrada.fecha)}
        nombres_service.agregar_item_catalogo("prestamos", persona)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}

    mensaje = "Último préstamo actualizado correctamente" if tipo == "prestamo" else "Último pago actualizado correctamente"
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


def eliminar_ultimo_prestamo(fecha: date) -> dict:
    try:
        resumen = excel_service.eliminar_ultimo_prestamo(fecha, fecha.year)
        if resumen is None:
            return {"ok": False, "mensaje": "No hay un último movimiento de préstamos para eliminar.", "fecha": str(fecha)}
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}

    return {
        "ok": True,
        "mensaje": "Último movimiento de préstamos eliminado correctamente",
        "fecha": str(fecha),
        "total_prestado": resumen["total_prestado"],
        "total_pagado": resumen["total_pagado"],
        "saldo_pendiente": resumen["saldo_pendiente"],
        "fecha_hora_registro": datetime.now().replace(microsecond=0).isoformat(),
    }


def actualizar_prestamo_registro(entrada: PrestamoEntrada, sheet_row: int | None, fecha_hora_registro: str) -> dict:
    persona = entrada.persona.strip()
    tipo = entrada.tipo_movimiento
    valor = float(entrada.valor)

    ultimo = excel_service.obtener_prestamos_raw_fecha(entrada.fecha, entrada.fecha.year)
    actual = next(
        (
            item for item in ultimo
            if ((sheet_row is not None and item.get("sheet_row") == sheet_row) or (fecha_hora_registro and item.get("fecha_hora_registro") == fecha_hora_registro))
        ),
        None,
    )
    if actual is None:
        return {"ok": False, "mensaje": "No se encontró el movimiento seleccionado para corregir.", "fecha": str(entrada.fecha)}

    resumen_actual = excel_service.obtener_resumen_prestamos(persona=persona)
    saldo_ajustado = float(resumen_actual["saldo_pendiente"])
    if str(actual.get("persona", "")).strip().lower() == persona.lower():
        if actual.get("tipo_movimiento") == "pago":
            saldo_ajustado += float(actual.get("valor") or 0)
        else:
            saldo_ajustado -= float(actual.get("valor") or 0)

    if tipo == "pago" and valor > saldo_ajustado:
        return {
            "ok": False,
            "mensaje": f"El pago supera el saldo pendiente de {persona}. Saldo actual: {int(saldo_ajustado):,}".replace(",", "."),
            "fecha": str(entrada.fecha),
        }

    try:
        timestamp = datetime.now().replace(microsecond=0)
        resumen = excel_service.actualizar_prestamo_registro(
            entrada.fecha, entrada.fecha.year, sheet_row, fecha_hora_registro, persona, tipo, valor, timestamp
        )
        if resumen is None:
            return {"ok": False, "mensaje": "No se encontró el movimiento seleccionado para corregir.", "fecha": str(entrada.fecha)}
        nombres_service.agregar_item_catalogo("prestamos", persona)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}
    mensaje = "Préstamo actualizado correctamente" if tipo == "prestamo" else "Pago actualizado correctamente"
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


def eliminar_prestamo_registro(fecha: date, sheet_row: int | None, fecha_hora_registro: str) -> dict:
    try:
        resumen = excel_service.eliminar_prestamo_registro(fecha, fecha.year, sheet_row, fecha_hora_registro)
        if resumen is None:
            return {"ok": False, "mensaje": "No se encontró el movimiento seleccionado para eliminar.", "fecha": str(fecha)}
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}
    return {
        "ok": True,
        "mensaje": "Movimiento de préstamos eliminado correctamente",
        "fecha": str(fecha),
        "total_prestado": resumen["total_prestado"],
        "total_pagado": resumen["total_pagado"],
        "saldo_pendiente": resumen["saldo_pendiente"],
        "fecha_hora_registro": datetime.now().replace(microsecond=0).isoformat(),
    }
