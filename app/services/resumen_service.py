from __future__ import annotations

from datetime import date, timedelta

from app.services import excel_service
from app.services.caja_service import DENOMINACIONES


def _fmt_fecha(fecha: date) -> str:
    return fecha.strftime("%d-%m-%Y")


def _obtener_fechas_caja(fecha_hasta: date, years_back: int = 2) -> set[date]:
    fechas = set()
    for year in range(fecha_hasta.year, fecha_hasta.year - years_back, -1):
        for f in excel_service.obtener_fechas_modulo_año("caja", year):
            try:
                fechas.add(date.fromisoformat(f))
            except ValueError:
                continue
    return fechas


def _encontrar_inicio_periodo_resumen(fecha_objetivo: date) -> date:
    fechas_caja = _obtener_fechas_caja(fecha_objetivo)
    anteriores = [d for d in fechas_caja if d < fecha_objetivo]
    if anteriores:
        return max(anteriores) + timedelta(days=1)
    return fecha_objetivo


def calcular_periodo_resumen(fecha_objetivo: date) -> list[date]:
    inicio = _encontrar_inicio_periodo_resumen(fecha_objetivo)
    periodo = []
    d = inicio
    while d <= fecha_objetivo:
        periodo.append(d)
        d += timedelta(days=1)
    return periodo


def resolver_periodo_resumen(fecha_objetivo: date) -> dict:
    periodo = calcular_periodo_resumen(fecha_objetivo)
    fechas_caja = _obtener_fechas_caja(fecha_objetivo)
    dias_acumulados = [d for d in periodo if d not in fechas_caja]
    tiene_caja_dia = fecha_objetivo in fechas_caja

    mensaje_info = ""
    if dias_acumulados:
        fechas_txt = ", ".join(_fmt_fecha(d) for d in dias_acumulados)
        mensaje_info = f"Se acumularon registros de {fechas_txt} por falta de Caja."
    if not tiene_caja_dia:
        msg_falta = f"Falta Caja para el {_fmt_fecha(fecha_objetivo)}."
        mensaje_info = f"{mensaje_info} {msg_falta}".strip()

    return {
        "periodo": [str(d) for d in periodo],
        "dias_acumulados": [str(d) for d in dias_acumulados],
        "mensaje_info": mensaje_info,
        "tiene_caja_dia": tiene_caja_dia,
    }


def calcular_resumen(fecha_objetivo: date) -> dict:
    periodo = calcular_periodo_resumen(fecha_objetivo)

    total_practisistemas = 0.0
    total_deportivas = 0.0
    total_bonos = 0.0
    total_gastos = 0.0
    total_prestamos_salida = 0.0
    total_prestamos_entrada = 0.0
    total_mov_ingresos = 0.0
    total_mov_salidas = 0.0

    bonos_por_cliente: dict[str, float] = {}
    gastos_items: list[dict] = []
    prestamos_por_persona: dict[str, dict] = {}

    for d in periodo:
        plataformas_data = excel_service.obtener_datos_plataformas_fecha(d, d.year)
        if plataformas_data:
            total_practisistemas += float(plataformas_data.get("venta_practisistemas", 0))
            total_deportivas += float(plataformas_data.get("venta_deportivas", 0))

        for b in excel_service.obtener_bonos_fecha(d, d.year):
            valor = float(b.get("valor", 0))
            total_bonos += valor
            cliente = b.get("cliente", "")
            bonos_por_cliente[cliente] = bonos_por_cliente.get(cliente, 0.0) + valor

        gastos_data = excel_service.obtener_items_modulo_fecha("gastos", d, d.year)
        if gastos_data:
            for g in gastos_data.get("items", []):
                gastos_items.append({"concepto": g.get("concepto", ""), "valor": float(g.get("valor", 0))})
                total_gastos += float(g.get("valor", 0))

        for p in excel_service.obtener_prestamos_raw_fecha(d, d.year):
            valor = float(p.get("valor", 0))
            tipo = p.get("tipo_movimiento", "prestamo")
            persona = p.get("persona", "")
            if tipo == "pago":
                total_prestamos_entrada += valor
            else:
                total_prestamos_salida += valor
            if persona not in prestamos_por_persona:
                prestamos_por_persona[persona] = {"prestamos": 0.0, "pagos": 0.0}
            if tipo == "pago":
                prestamos_por_persona[persona]["pagos"] += valor
            else:
                prestamos_por_persona[persona]["prestamos"] += valor

        for m in excel_service.obtener_movimientos_fecha(d, d.year):
            valor = float(m.get("valor", 0))
            if m.get("tipo_movimiento") == "ingreso":
                total_mov_ingresos += valor
            else:
                total_mov_salidas += valor

    caja_fisica_data = excel_service.obtener_datos_caja_fecha(fecha_objetivo, fecha_objetivo.year)
    caja_fisica = 0.0
    caja_desglose: dict = {
        "billetes": {},
        "total_billetes": 0.0,
        "total_monedas": 0.0,
        "billetes_viejos": 0.0,
    }
    if caja_fisica_data:
        billetes_sum = 0.0
        billetes_raw = caja_fisica_data.get("billetes", {})
        for denom in DENOMINACIONES:
            cantidad = int(billetes_raw.get(str(denom), 0))
            subtotal = denom * cantidad
            billetes_sum += subtotal
            caja_desglose["billetes"][str(denom)] = {"cantidad": cantidad, "subtotal": subtotal}
        monedas = float(caja_fisica_data.get("total_monedas", 0))
        viejos = float(caja_fisica_data.get("billetes_viejos", 0))
        caja_fisica = billetes_sum + monedas + viejos
        caja_desglose["total_billetes"] = billetes_sum
        caja_desglose["total_monedas"] = monedas
        caja_desglose["billetes_viejos"] = viejos

    top_bonos = sorted(
        [{"cliente": k, "total": v} for k, v in bonos_por_cliente.items()],
        key=lambda x: x["total"],
        reverse=True,
    )[:5]

    prestamos_resumen = [
        {
            "persona": persona,
            "prestamos": vals["prestamos"],
            "pagos": vals["pagos"],
            "neto": vals["pagos"] - vals["prestamos"],
        }
        for persona, vals in prestamos_por_persona.items()
    ]

    return {
        "periodo": [str(d) for d in periodo],
        "fecha_inicio_periodo": str(periodo[0]) if periodo else str(fecha_objetivo),
        "bonos": {"top5": top_bonos, "total": total_bonos},
        "plataformas": {
            "total_practisistemas": total_practisistemas,
            "total_deportivas": total_deportivas,
            "total": total_practisistemas + total_deportivas,
        },
        "gastos": {"items": gastos_items, "total": total_gastos},
        "prestamos": {
            "resumen": prestamos_resumen,
            "total_salida": total_prestamos_salida,
            "total_entrada": total_prestamos_entrada,
            "neto": total_prestamos_entrada - total_prestamos_salida,
        },
        "movimientos": {
            "total_ingresos": total_mov_ingresos,
            "total_salidas": total_mov_salidas,
            "neto": total_mov_ingresos - total_mov_salidas,
        },
        "caja_desglose": caja_desglose,
        "caja_fisica": caja_fisica,
    }
