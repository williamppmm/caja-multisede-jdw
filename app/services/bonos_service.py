from datetime import date, datetime

from app.models.caja_models import BonoEntrada
from app.services import nombres_service, excel_service


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


def guardar_bono(entrada: BonoEntrada) -> dict:
    hoy = date.today()
    if entrada.fecha != hoy and not entrada.forzar:
        return {
            "ok": False,
            "mensaje": "Solo puedes registrar bonos en la fecha actual. Para corregir otra fecha necesitas admin.",
            "fecha": str(entrada.fecha),
        }

    try:
        timestamp = datetime.now().replace(microsecond=0)
        total_dia = excel_service.guardar_bono_registro(
            entrada.fecha,
            entrada.cliente.strip(),
            entrada.valor,
            timestamp,
        )
        nombres_service.agregar_nombre(entrada.cliente)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}

    return _sincronizar_cuadre({
        "ok": True,
        "mensaje": "Bono registrado correctamente",
        "fecha": str(entrada.fecha),
        "hora": timestamp.strftime("%I:%M %p"),
        "cliente": entrada.cliente.strip(),
        "valor": entrada.valor,
        "total_dia": total_dia,
        "fecha_hora_registro": timestamp.isoformat(),
    }, entrada.fecha)


def obtener_registros(fecha: date) -> dict:
    items = excel_service.obtener_bonos_fecha(fecha, fecha.year)
    return {"items": items, "total": sum(item["valor"] for item in items)}


def actualizar_ultimo_bono(fecha: date, cliente: str, valor: float) -> dict:
    try:
        timestamp = datetime.now().replace(microsecond=0)
        registro = excel_service.actualizar_ultimo_bono(fecha, fecha.year, cliente.strip(), valor, timestamp)
        if registro is None:
            return {"ok": False, "mensaje": "No hay un último bono para corregir.", "fecha": str(fecha)}
        nombres_service.agregar_nombre(cliente)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}

    return _sincronizar_cuadre({
        "ok": True,
        "mensaje": "Último bono actualizado correctamente",
        "fecha": str(fecha),
        "hora": registro["hora_display"],
        "cliente": cliente.strip(),
        "valor": valor,
        "total_dia": registro["total_dia"],
        "fecha_hora_registro": timestamp.isoformat(),
    }, fecha)


def eliminar_ultimo_bono(fecha: date) -> dict:
    try:
        total_dia = excel_service.eliminar_ultimo_bono(fecha, fecha.year)
        if total_dia is None:
            return {"ok": False, "mensaje": "No hay un último bono para eliminar.", "fecha": str(fecha)}
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}

    return _sincronizar_cuadre({
        "ok": True,
        "mensaje": "Último bono eliminado correctamente",
        "fecha": str(fecha),
        "hora": "",
        "cliente": "",
        "valor": 0,
        "total_dia": total_dia,
        "fecha_hora_registro": datetime.now().replace(microsecond=0).isoformat(),
    }, fecha)
