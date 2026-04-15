from datetime import date, datetime

from app.config import DENOMINACIONES
from app.models.caja_models import CajaEntrada, ModuloItemsEntrada, PlataformasEntrada
from app.services import cuadre_service, excel_service, nombres_service


ROW_TYPES = {
    "gastos": "gasto",
    "bonos": "bono",
    "prestamos": "prestamo",
    "movimientos": "movimiento",
}


def construir_filas_caja(entrada: CajaEntrada, timestamp: datetime) -> tuple[list, float, float]:
    fecha = entrada.fecha
    filas = []

    total_billetes = 0.0
    for denom in DENOMINACIONES:
        cantidad = entrada.billetes.get(str(denom), 0)
        subtotal = cantidad * denom
        total_billetes += subtotal
        filas.append([
            fecha,
            "billete",
            "Billetes",
            denom,
            cantidad,
            denom,
            subtotal,
            timestamp,
        ])

    filas.append([fecha, "manual", "Total monedas", 0, 0, 0, entrada.total_monedas, timestamp])
    filas.append([fecha, "manual", "Billetes viejos", 0, 0, 0, entrada.billetes_viejos, timestamp])
    total_caja_fisica = total_billetes + entrada.total_monedas + entrada.billetes_viejos
    filas.append([fecha, "resumen", "Total caja fisica", 0, 0, 0, total_caja_fisica, timestamp])
    return filas, total_billetes, total_caja_fisica


def construir_filas_items(modulo: str, entrada: ModuloItemsEntrada, timestamp: datetime) -> tuple[list, float, int]:
    row_type = ROW_TYPES[modulo]
    filas = []
    total = 0.0
    cantidad = 0
    for item in entrada.items:
        concepto = item.concepto.strip()
        valor = item.valor
        if not concepto or valor == 0:
            continue
        filas.append([entrada.fecha, row_type, concepto, 0, 0, 0, valor, timestamp])
        total += valor
        cantidad += 1
    return filas, total, cantidad


def guardar_caja(entrada: CajaEntrada) -> dict:
    year = entrada.fecha.year

    try:
        reemplazar_fecha = None
        if excel_service.fecha_existe_modulo("caja", entrada.fecha, year):
            if not entrada.forzar:
                return {
                    "ok": False,
                    "mensaje": f"Ya existe un registro de caja para {entrada.fecha}.",
                    "fecha": str(entrada.fecha),
                }
            reemplazar_fecha = entrada.fecha

        timestamp = datetime.now().replace(microsecond=0)
        filas, total_billetes, total_caja_fisica = construir_filas_caja(entrada, timestamp)
        excel_service.guardar_filas_modulo("caja", filas, year, reemplazar_fecha=reemplazar_fecha)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}

    sync_result = cuadre_service.autoguardar_cuadre_si_listo(entrada.fecha)
    mensaje = "Caja guardada correctamente"
    if sync_result and sync_result.get("ok"):
        mensaje += " y Cuadre sincronizado automaticamente"
    if entrada.forzar:
        mensaje = cuadre_service.anexar_mensaje_sync(
            mensaje,
            cuadre_service.sincronizar_cuadre_afectado(entrada.fecha),
        )

    return {
        "ok": True,
        "mensaje": mensaje,
        "fecha": str(entrada.fecha),
        "total_billetes": total_billetes,
        "total_caja_fisica": total_caja_fisica,
        "fecha_hora_registro": timestamp.isoformat(),
    }


def guardar_plataformas(entrada: PlataformasEntrada) -> dict:
    year = entrada.fecha.year
    hoy = date.today()

    if entrada.fecha != hoy and not entrada.forzar:
        return {
            "ok": False,
            "mensaje": "Solo puedes guardar plataformas en la fecha actual. Para corregir otra fecha necesitas admin.",
            "fecha": str(entrada.fecha),
        }

    try:
        reemplazar_fecha = entrada.fecha if entrada.forzar else None
        timestamp = datetime.now().replace(microsecond=0)
        total = float(entrada.venta_practisistemas or 0) + float(entrada.venta_deportivas or 0)
        filas = [[
            entrada.fecha,
            float(entrada.venta_practisistemas or 0),
            float(entrada.venta_deportivas or 0),
            total,
            timestamp,
        ]]
        excel_service.guardar_filas_modulo("plataformas", filas, year, reemplazar_fecha=reemplazar_fecha)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}

    sync_result = cuadre_service.sincronizar_cuadre_afectado(entrada.fecha)

    return {
        "ok": True,
        "mensaje": cuadre_service.anexar_mensaje_sync("Plataformas guardadas correctamente", sync_result),
        "fecha": str(entrada.fecha),
        "venta_practisistemas": float(entrada.venta_practisistemas or 0),
        "venta_deportivas": float(entrada.venta_deportivas or 0),
        "total_plataformas": total,
        "fecha_hora_registro": timestamp.isoformat(),
    }


def guardar_items_modulo(modulo: str, entrada: ModuloItemsEntrada) -> dict:
    year = entrada.fecha.year
    hoy = date.today()

    if modulo not in ROW_TYPES:
        return {"ok": False, "mensaje": "Modulo no soportado.", "fecha": str(entrada.fecha)}

    if entrada.fecha != hoy and not entrada.forzar:
        return {
            "ok": False,
            "mensaje": f"Solo puedes guardar {modulo} en la fecha actual. Para corregir otra fecha necesitas admin.",
            "fecha": str(entrada.fecha),
        }

    try:
        timestamp = datetime.now().replace(microsecond=0)
        filas, total, cantidad = construir_filas_items(modulo, entrada, timestamp)
        excel_service.guardar_filas_modulo(modulo, filas, year)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}

    nombre = {
        "gastos": "Gastos",
        "prestamos": "Prestamos",
        "bonos": "Bonos",
        "movimientos": "Movimientos",
    }.get(modulo, modulo.title())
    sync_result = cuadre_service.sincronizar_cuadre_afectado(entrada.fecha)
    return {
        "ok": True,
        "mensaje": cuadre_service.anexar_mensaje_sync(f"{nombre} guardados correctamente", sync_result),
        "fecha": str(entrada.fecha),
        "total": total,
        "cantidad_items": cantidad,
        "fecha_hora_registro": timestamp.isoformat(),
    }


def consultar_estado_modulo(modulo: str, fecha_str: str) -> dict:
    fecha = date.fromisoformat(fecha_str)
    existe = excel_service.fecha_existe_modulo(modulo, fecha, fecha.year)
    today = date.today()
    ayer = date.fromordinal(today.toordinal() - 1)
    if modulo in ROW_TYPES or modulo == "plataformas":
        requiere_admin = fecha != today
    elif modulo == "caja":
        requiere_admin = existe or fecha not in {today, ayer}
    return {
        "fecha": fecha_str,
        "existe": existe,
        "requiere_admin": requiere_admin,
        "editable_libre": (
            ((modulo in ROW_TYPES or modulo == "plataformas") and fecha == today)
            or (modulo == "caja" and not requiere_admin)
        ),
    }
