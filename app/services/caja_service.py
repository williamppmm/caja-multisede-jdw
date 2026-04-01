from datetime import datetime
from app.config import DENOMINACIONES
from app.models.caja_models import CajaEntrada
from app.services import excel_service


def construir_filas(entrada: CajaEntrada, timestamp: datetime) -> tuple[list, float, float]:
    """
    Devuelve (filas, total_billetes, total_caja_fisica).
    Cada fila es una lista lista para ws.append().
    """
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

    # Manuales
    filas.append([fecha, "manual", "Total monedas", 0, 0, 0, entrada.total_monedas, timestamp])
    filas.append([fecha, "manual", "Billetes viejos", 0, 0, 0, entrada.billetes_viejos, timestamp])

    # Informativos
    filas.append([fecha, "informativo", "Venta Practisistemas", 0, 0, 0, entrada.venta_practisistemas, timestamp])
    filas.append([fecha, "informativo", "Venta Deportivas", 0, 0, 0, entrada.venta_deportivas, timestamp])

    # Resumen
    total_caja_fisica = total_billetes + entrada.total_monedas + entrada.billetes_viejos
    filas.append([fecha, "resumen", "Total caja fisica", 0, 0, 0, total_caja_fisica, timestamp])

    return filas, total_billetes, total_caja_fisica


def guardar_caja(entrada: CajaEntrada) -> dict:
    year = entrada.fecha.year

    try:
        if excel_service.fecha_existe(entrada.fecha, year):
            if not entrada.forzar:
                return {
                    "ok": False,
                    "mensaje": f"Ya existe un registro para {entrada.fecha}.",
                    "fecha": str(entrada.fecha),
                }
            excel_service.eliminar_fecha(entrada.fecha, year)

        timestamp = datetime.now().replace(microsecond=0)
        filas, total_billetes, total_caja_fisica = construir_filas(entrada, timestamp)
        excel_service.guardar_filas(filas, year)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {
            "ok": False,
            "mensaje": str(exc),
            "fecha": str(entrada.fecha),
        }

    return {
        "ok": True,
        "mensaje": "Caja guardada correctamente",
        "fecha": str(entrada.fecha),
        "total_billetes": total_billetes,
        "total_caja_fisica": total_caja_fisica,
        "fecha_hora_registro": timestamp.isoformat(),
    }


def consultar_fecha(fecha_str: str) -> dict:
    from datetime import date
    fecha = date.fromisoformat(fecha_str)
    existe = excel_service.fecha_existe(fecha, fecha.year)
    return {"fecha": fecha_str, "existe": existe}
