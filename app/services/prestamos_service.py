from datetime import date, datetime

from app.models.caja_models import PrestamoEntrada
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
    resumen_actual = excel_service.obtener_resumen_prestamos(persona=persona, fecha_hasta=entrada.fecha)
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
                "total_prestado": float(resumen_actual["total_prestado"] or 0),
                "total_pagado": float(resumen_actual["total_pagado"] or 0) + valor,
                "saldo_pendiente": float(resumen_actual["saldo_pendiente"] or 0) - valor,
            }
        else:
            resumen = {
                "total_prestado": float(resumen_actual["total_prestado"] or 0) + valor,
                "total_pagado": float(resumen_actual["total_pagado"] or 0),
                "saldo_pendiente": float(resumen_actual["saldo_pendiente"] or 0) + valor,
            }
        nombres_service.agregar_persona(persona)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}

    mensaje = "Préstamo registrado correctamente" if tipo == "prestamo" else "Pago registrado correctamente"
    return _sincronizar_cuadre({
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
    }, entrada.fecha)


def obtener_registros() -> dict:
    resumen = excel_service.obtener_resumen_prestamos()
    return resumen


def actualizar_ultimo_prestamo(entrada: PrestamoEntrada) -> dict:
    persona = entrada.persona.strip()
    tipo = entrada.tipo_movimiento
    valor = float(entrada.valor)

    ultimo = excel_service.obtener_ultimo_prestamo(entrada.fecha, entrada.fecha.year)
    if ultimo is None:
        return {"ok": False, "mensaje": "No hay un último movimiento de préstamos para corregir.", "fecha": str(entrada.fecha)}

    saldo_actual = float(ultimo.get("saldo_pendiente", 0) or 0)
    saldo_ajustado = saldo_actual
    if str(ultimo.get("tipo_movimiento", "")).strip().lower() == "prestamo":
        saldo_ajustado -= float(ultimo.get("valor", 0) or 0)
    elif str(ultimo.get("tipo_movimiento", "")).strip().lower() == "pago":
        saldo_ajustado += float(ultimo.get("valor", 0) or 0)

    if tipo == "pago" and valor > saldo_ajustado:
        return {
            "ok": False,
            "mensaje": f"El pago supera el saldo pendiente de {persona}. Saldo actual: {int(saldo_ajustado):,}".replace(",", "."),
            "fecha": str(entrada.fecha),
        }

    try:
        timestamp = datetime.now().replace(microsecond=0)
        items = excel_service.actualizar_ultimo_prestamo(
            entrada.fecha,
            entrada.fecha.year,
            persona,
            tipo,
            valor,
            timestamp,
        )
        if items is None:
            return {"ok": False, "mensaje": "No hay un último movimiento de préstamos para corregir.", "fecha": str(entrada.fecha)}
        nombres_service.agregar_persona(persona)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}

    resumen = excel_service.obtener_resumen_prestamos(persona=persona, fecha_hasta=entrada.fecha)
    mensaje = "Último préstamo actualizado correctamente" if tipo == "prestamo" else "Último pago actualizado correctamente"
    return _sincronizar_cuadre({
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
    }, entrada.fecha)


def eliminar_ultimo_prestamo(fecha: date) -> dict:
    ultimo = excel_service.obtener_ultimo_prestamo(fecha, fecha.year)
    if ultimo is None:
        return {"ok": False, "mensaje": "No hay un último movimiento de préstamos para eliminar.", "fecha": str(fecha)}
    persona_eliminada = str(ultimo.get("persona", "")).strip()

    try:
        items = excel_service.eliminar_ultimo_prestamo(fecha, fecha.year)
        if items is None:
            return {"ok": False, "mensaje": "No hay un último movimiento de préstamos para eliminar.", "fecha": str(fecha)}
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}

    resumen = excel_service.obtener_resumen_prestamos(persona=persona_eliminada, fecha_hasta=fecha)
    return _sincronizar_cuadre({
        "ok": True,
        "mensaje": "Último movimiento de préstamos eliminado correctamente",
        "fecha": str(fecha),
        "total_prestado": resumen["total_prestado"],
        "total_pagado": resumen["total_pagado"],
        "saldo_pendiente": resumen["saldo_pendiente"],
        "fecha_hora_registro": datetime.now().replace(microsecond=0).isoformat(),
    }, fecha)
