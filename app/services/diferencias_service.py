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
        "semana_actual": _construir_semana_actual(hoy, dias),
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
                "semana_inicio": _inicio_semana(cursor).isoformat(),
            }
        )
        cursor += timedelta(days=1)

    return dias


def _construir_semana_actual(hoy: date, dias: list[dict]) -> dict:
    inicio = _inicio_semana(hoy)
    dias_semana = [
        item for item in dias
        if inicio <= date.fromisoformat(item["fecha"]) <= hoy
    ]
    return {
        "label": f"Semana actual ({_rango_label(dias_semana)})" if dias_semana else "Semana actual",
        "resumen": _resumen_diferencias(dias_semana),
        "dias": [_dia_publico(item) for item in dias_semana],
    }


def _construir_mes_actual(hoy: date, dias: list[dict]) -> dict:
    inicio_semana_actual = _inicio_semana(hoy)
    semanas_previas: dict[str, list[dict]] = {}

    for item in dias:
        fecha_item = date.fromisoformat(item["fecha"])
        if fecha_item.month != hoy.month or fecha_item >= inicio_semana_actual:
            continue
        semanas_previas.setdefault(item["semana_inicio"], []).append(item)

    semanas_ordenadas = [
        _serializar_grupo_semana(semanas_previas[inicio])
        for inicio in sorted(semanas_previas.keys(), reverse=True)
    ]

    return {
        "label": f"{MESES_ES[hoy.month]} {hoy.year}",
        "resumen": _resumen_diferencias([item for item in dias if item["mes"] == hoy.month]),
        "semanas_previas": semanas_ordenadas,
    }


def _construir_meses_previos(hoy: date, dias: list[dict]) -> list[dict]:
    meses = []
    for mes in range(hoy.month - 1, 0, -1):
        dias_mes = [item for item in dias if item["mes"] == mes]
        if not dias_mes:
            continue

        semanas: dict[str, list[dict]] = {}
        for item in dias_mes:
            semanas.setdefault(item["semana_inicio"], []).append(item)

        semanas_serializadas = [
            _serializar_grupo_semana(semanas[inicio])
            for inicio in sorted(semanas.keys(), reverse=True)
        ]

        meses.append(
            {
                "label": f"{MESES_ES[mes]} {hoy.year}",
                "resumen": _resumen_diferencias(dias_mes),
                "semanas": semanas_serializadas,
            }
        )

    return meses


def _serializar_grupo_semana(dias_semana: list[dict]) -> dict:
    dias_ordenados = sorted(dias_semana, key=lambda item: item["fecha"])
    return {
        "label": f"Semana {_rango_label(dias_ordenados)}",
        "resumen": _resumen_diferencias(dias_ordenados),
        "dias": [_dia_publico(item) for item in dias_ordenados],
    }


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


def _inicio_semana(fecha_ref: date) -> date:
    return fecha_ref - timedelta(days=fecha_ref.weekday())


def _rango_label(items: list[dict]) -> str:
    if not items:
        return ""
    desde = date.fromisoformat(items[0]["fecha"])
    hasta = date.fromisoformat(items[-1]["fecha"])
    if desde.month == hasta.month:
        return f"{desde.day:02d} al {hasta.day:02d} de {MESES_ES[hasta.month].lower()}"
    return f"{desde.day:02d} {MESES_ES[desde.month].lower()} al {hasta.day:02d} {MESES_ES[hasta.month].lower()}"
