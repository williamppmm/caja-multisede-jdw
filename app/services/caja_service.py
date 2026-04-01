from datetime import date, datetime

from app.config import DENOMINACIONES
from app.models.caja_models import CajaEntrada, ModuloItemsEntrada
from app.services import excel_service, nombres_service


ROW_TYPES = {
    "gastos": "gasto",
    "bonos": "bono",
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
    filas.append([fecha, "informativo", "Venta Practisistemas", 0, 0, 0, entrada.venta_practisistemas, timestamp])
    filas.append([fecha, "informativo", "Venta Deportivas", 0, 0, 0, entrada.venta_deportivas, timestamp])

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

    return {
        "ok": True,
        "mensaje": "Caja guardada correctamente",
        "fecha": str(entrada.fecha),
        "total_billetes": total_billetes,
        "total_caja_fisica": total_caja_fisica,
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
        if modulo == "gastos":
            for item in entrada.items:
                nombres_service.agregar_item_catalogo("gastos", item.concepto)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(entrada.fecha)}

    nombre = "Gastos" if modulo == "gastos" else "Bonos"
    return {
        "ok": True,
        "mensaje": f"{nombre} guardados correctamente",
        "fecha": str(entrada.fecha),
        "total": total,
        "cantidad_items": cantidad,
        "fecha_hora_registro": timestamp.isoformat(),
    }


def consultar_estado_modulo(modulo: str, fecha_str: str) -> dict:
    fecha = date.fromisoformat(fecha_str)
    existe = excel_service.fecha_existe_modulo(modulo, fecha, fecha.year)
    requiere_admin = modulo == "caja" and existe
    if modulo in ROW_TYPES:
        requiere_admin = fecha != date.today()
    return {
        "fecha": fecha_str,
        "existe": existe,
        "requiere_admin": requiere_admin,
        "editable_libre": modulo in ROW_TYPES and fecha == date.today(),
    }
