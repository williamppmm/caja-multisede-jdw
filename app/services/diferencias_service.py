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

    resumen = _resumen_diferencias(dias)
    semana_actual = _construir_semana_actual(hoy, dias)
    mes_actual = _construir_mes_actual(hoy, dias)
    meses_previos = _construir_meses_previos(hoy, dias)

    return {
        "fecha_actual": hoy.isoformat(),
        "resumen": resumen,
        "semana_actual": semana_actual,
        "mes_actual": mes_actual,
        "meses_previos": meses_previos,
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
        caja_teorica = None
        caja_fisica = None
        incluye_balance = False

        if cursor == hoy:
            estado = "PENDIENTE"
        elif cuadre:
            diferencia = float(cuadre.get("diferencia") or 0)
            caja_teorica = float(cuadre.get("caja_teorica") or 0)
            caja_fisica = float(cuadre.get("caja_fisica") or 0)
            incluye_balance = True
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
                "caja_teorica": caja_teorica,
                "caja_fisica": caja_fisica,
                "incluye_balance": incluye_balance,
                "anio": cursor.year,
                "mes": cursor.month,
                "dia": cursor.day,
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
        "desde": dias_semana[0]["fecha"] if dias_semana else hoy.isoformat(),
        "hasta": dias_semana[-1]["fecha"] if dias_semana else hoy.isoformat(),
        "resumen": _resumen_diferencias(dias_semana),
        "dias": dias_semana,
    }


def _construir_mes_actual(hoy: date, dias: list[dict]) -> dict:
    inicio_semana_actual = _inicio_semana(hoy)
    semanas_previas: dict[str, list[dict]] = {}

    for item in dias:
        fecha_item = date.fromisoformat(item["fecha"])
        if fecha_item.month != hoy.month or fecha_item >= inicio_semana_actual:
            continue
        semanas_previas.setdefault(item["semana_inicio"], []).append(item)

    semanas_ordenadas = []
    for semana_inicio in sorted(semanas_previas.keys(), reverse=True):
        semana_dias = semanas_previas[semana_inicio]
        semanas_ordenadas.append(_serializar_grupo_semana(semana_dias))

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

        resumen = _resumen_diferencias(dias_mes)
        resumen["semanas_faltante_neto"] = sum(
            1 for semana in semanas_serializadas if (semana["resumen"].get("neto_diferencias") or 0) < 0
        )

        meses.append(
            {
                "label": f"{MESES_ES[mes]} {hoy.year}",
                "mes": mes,
                "resumen": resumen,
                "semanas": semanas_serializadas,
            }
        )

    return meses


def _serializar_grupo_semana(dias_semana: list[dict]) -> dict:
    dias_ordenados = sorted(dias_semana, key=lambda item: item["fecha"])
    return {
        "label": f"Semana {_rango_label(dias_ordenados)}",
        "desde": dias_ordenados[0]["fecha"],
        "hasta": dias_ordenados[-1]["fecha"],
        "resumen": _resumen_diferencias(dias_ordenados),
        "dias": dias_ordenados,
    }


def _resumen_diferencias(items: list[dict]) -> dict:
    total_faltantes = 0.0
    total_sobrantes = 0.0
    neto = 0.0
    dias_faltante = 0
    dias_sobrante = 0
    dias_ok = 0
    dias_no_opero = 0
    dias_pendiente = 0

    for item in items:
        estado = item.get("estado")
        diferencia = item.get("diferencia")
        if estado == "FALTANTE" and diferencia is not None:
            total_faltantes += abs(float(diferencia))
            neto += float(diferencia)
            dias_faltante += 1
        elif estado == "SOBRANTE" and diferencia is not None:
            total_sobrantes += float(diferencia)
            neto += float(diferencia)
            dias_sobrante += 1
        elif estado == "OK" and diferencia is not None:
            neto += float(diferencia)
            dias_ok += 1
        elif estado == "NO OPERÓ":
            dias_no_opero += 1
        elif estado == "PENDIENTE":
            dias_pendiente += 1

    return {
        "total_faltantes": total_faltantes,
        "total_sobrantes": total_sobrantes,
        "neto_diferencias": neto,
        "dias_faltante": dias_faltante,
        "dias_sobrante": dias_sobrante,
        "dias_ok": dias_ok,
        "dias_no_opero": dias_no_opero,
        "dias_pendiente": dias_pendiente,
    }


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
