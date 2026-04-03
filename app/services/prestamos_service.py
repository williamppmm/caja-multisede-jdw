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
