from __future__ import annotations

from datetime import date, timedelta

from app.services import excel_service

MESES_ES = [
    "",
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
]


def obtener_panel_diferencias_actual() -> dict:
    hoy = date.today()
    cuadres = _leer_cuadres_anio_actual(hoy.year)
    dias = _construir_estado_dias_hasta_hoy(hoy, cuadres)

    return {
        "mes_actual": _construir_mes_actual(hoy, dias),
        "meses_previos": _construir_meses_previos(hoy, dias),
    }


def _leer_cuadres_anio_actual(year: int) -> dict[str, dict]:
    path = excel_service._path_modulo("cuadre", year)
    if not path.exists():
        return {}

    datos: dict[str, dict] = {}
    with excel_service._abrir_workbook_lectura(path) as wb:
        hojas = excel_service._obtener_hojas_para_lectura(wb, "cuadre")
        if not hojas:
            return {}

        for ws in hojas:
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row or row[0] is None:
                    continue
                try:
                    cuadre = excel_service._parsear_fila_cuadre(row)
                    fecha_cierre = date.fromisoformat(cuadre["fecha"])
                except (KeyError, TypeError, ValueError):
                    continue
                if fecha_cierre.year != year:
                    continue
                datos[cuadre["fecha"]] = cuadre
    return datos


def _construir_estado_dias_hasta_hoy(hoy: date, cuadres: dict[str, dict]) -> list[dict]:
    dias = []
    cursor = date(hoy.year, 1, 1)

    while cursor <= hoy:
        iso = cursor.isoformat()
        cuadre = cuadres.get(iso)
        estado = "NO OPERÓ"
        diferencia = None

        if cursor == hoy:
            estado = "PENDIENTE"
        elif cuadre:
            diferencia = float(cuadre.get("diferencia") or 0)
            if diferencia < 0:
                estado = "FALTANTE"
            elif diferencia > 0:
                estado = "SOBRANTE"
            else:
                estado = "OK"

        dias.append(
            {
                "fecha": iso,
                "estado": estado,
                "diferencia": diferencia,
                "mes": cursor.month,
            }
        )
        cursor += timedelta(days=1)

    return dias


def _construir_mes_actual(hoy: date, dias: list[dict]) -> dict:
    dias_mes = [item for item in dias if item["mes"] == hoy.month]
    return {
        "label": f"{MESES_ES[hoy.month]} {hoy.year}",
        "resumen": _resumen_diferencias(dias_mes),
        "dias": [_dia_publico(item) for item in dias_mes],
    }


def _construir_meses_previos(hoy: date, dias: list[dict]) -> list[dict]:
    meses = []
    for mes in range(hoy.month - 1, 0, -1):
        dias_mes = [item for item in dias if item["mes"] == mes]
        if not dias_mes:
            continue

        meses.append(
            {
                "label": f"{MESES_ES[mes]} {hoy.year}",
                "resumen": _resumen_diferencias(dias_mes),
                "dias": [_dia_publico(item) for item in dias_mes],
            }
        )

    return meses


def _dia_publico(item: dict) -> dict:
    return {"fecha": item["fecha"], "diferencia": item["diferencia"]}


def _resumen_diferencias(items: list[dict]) -> dict:
    neto = 0.0
    for item in items:
        diferencia = item.get("diferencia")
        if diferencia is None:
            continue
        neto += float(diferencia)
    return {"neto_diferencias": neto}
