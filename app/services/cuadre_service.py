from collections import defaultdict
from datetime import date, datetime, timedelta
from types import SimpleNamespace

from app.config import DENOMINACIONES
from app.services import excel_service, startup_state_service


# ─── Helpers de fechas ────────────────────────────────────────────────────────

def obtener_ultima_fecha_cuadre(antes_de: date | None = None) -> date | None:
    if antes_de is not None:
        years = range(antes_de.year, antes_de.year - 5, -1)
    else:
        years = [date.today().year, date.today().year - 1]

    ultima = None
    for year in years:
        candidata = excel_service.obtener_ultima_fecha_modulo("cuadre", year)
        if candidata is None:
            continue
        if antes_de is not None and candidata >= antes_de:
            path = excel_service._path_modulo("cuadre", year)
            if not path.exists():
                continue
            with excel_service._abrir_workbook_lectura(path) as wb:
                hojas = excel_service._obtener_hojas_para_lectura(wb, "cuadre")
                if not hojas:
                    continue
                for ws in hojas:
                    for row in ws.iter_rows(min_row=2, values_only=True):
                        cell_date = row[0]
                        if isinstance(cell_date, datetime):
                            cell_date = cell_date.date()
                        if isinstance(cell_date, date) and cell_date < antes_de:
                            if ultima is None or cell_date > ultima:
                                ultima = cell_date
            continue
        if ultima is None or candidata > ultima:
            ultima = candidata
    return ultima


def obtener_base_anterior_valor(fecha_cuadre: date) -> float | None:
    ultima = obtener_ultima_fecha_cuadre(fecha_cuadre)
    if ultima is None:
        startup_date = startup_state_service.get_startup_date()
        startup_cash = startup_state_service.get_startup_cash()
        if startup_date is not None and startup_cash is not None and startup_date <= fecha_cuadre:
            return float(startup_cash)
        return None
    datos = excel_service.obtener_datos_cuadre_fecha(ultima, ultima.year)
    if datos is None:
        return None
    return float(datos.get("base_nueva", 0))


def _obtener_primera_fecha_operativa_desde(fecha_inicio: date, fecha_cuadre: date) -> date | None:
    modulos = ["caja", "contadores", "plataformas", "gastos", "bonos", "prestamos", "movimientos"]
    candidata = None
    for year in range(fecha_inicio.year, fecha_cuadre.year + 1):
        for modulo in modulos:
            for fecha_str in excel_service.obtener_fechas_modulo_año(modulo, year):
                try:
                    fecha_reg = date.fromisoformat(fecha_str)
                except ValueError:
                    continue
                if fecha_reg < fecha_inicio or fecha_reg > fecha_cuadre:
                    continue
                if candidata is None or fecha_reg < candidata:
                    candidata = fecha_reg
    return candidata


def _fmt(d: date) -> str:
    return d.strftime("%d-%m-%Y")


# ─── Período operativo ────────────────────────────────────────────────────────

def _cargar_fechas_modulos(modulos: list[str], years: list[int]) -> dict[str, set[date]]:
    fechas_por_modulo: dict[str, set[date]] = {modulo: set() for modulo in modulos}
    for year in years:
        for modulo in modulos:
            for fecha_str in excel_service.obtener_fechas_modulo_año(modulo, year):
                try:
                    fechas_por_modulo[modulo].add(date.fromisoformat(fecha_str))
                except ValueError:
                    continue
    return fechas_por_modulo


def _cargar_datos_periodo(periodo: list[date]) -> dict:
    fechas_por_year: dict[int, set[date]] = defaultdict(set)
    for fecha in periodo:
        fechas_por_year[fecha.year].add(fecha)

    datos = {
        "plataformas": {},
        "bonos": defaultdict(list),
        "gastos": defaultdict(list),
        "prestamos": defaultdict(list),
        "movimientos": defaultdict(list),
    }

    for year, fechas in fechas_por_year.items():
        path = excel_service.get_excel_path(year)
        if not path.exists():
            continue

        with excel_service._abrir_workbook_lectura(path) as wb:
            for ws in excel_service._obtener_hojas_para_lectura(wb, "plataformas"):
                for row in ws.iter_rows(min_row=2, values_only=True):
                    if row[0] is None:
                        continue
                    cell_date = row[0]
                    if isinstance(cell_date, datetime):
                        cell_date = cell_date.date()
                    if not isinstance(cell_date, date) or cell_date not in fechas:
                        continue
                    if cell_date in datos["plataformas"]:
                        continue
                    datos["plataformas"][cell_date] = {
                        "venta_practisistemas": float(row[1] or 0),
                        "venta_deportivas": float(row[2] or 0),
                        "total_plataformas": float(row[3] or 0),
                    }

            for ws in excel_service._obtener_hojas_para_lectura(wb, "bonos"):
                for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                    if row[0] is None:
                        continue
                    cell_date = row[0]
                    if isinstance(cell_date, datetime):
                        cell_date = cell_date.date()
                    if not isinstance(cell_date, date) or cell_date not in fechas:
                        continue
                    hora = row[1]
                    if isinstance(hora, datetime):
                        hora_texto = hora.strftime("%I:%M %p")
                    else:
                        hora_texto = str(hora or "")
                    datos["bonos"][cell_date].append({
                        "sheet_row": idx,
                        "fecha": cell_date.isoformat(),
                        "fecha_display": cell_date.strftime("%d-%m-%Y"),
                        "hora_display": hora_texto,
                        "cliente": str(row[2] or ""),
                        "valor": float(row[3] or 0),
                        "fecha_hora_registro": row[4].isoformat() if isinstance(row[4], datetime) else str(row[4] or ""),
                    })

            for ws in excel_service._obtener_hojas_para_lectura(wb, "gastos"):
                for row in ws.iter_rows(min_row=2, values_only=True):
                    if row[0] is None or not excel_service._fila_es_modulo("gastos", row):
                        continue
                    cell_date = row[0]
                    if isinstance(cell_date, datetime):
                        cell_date = cell_date.date()
                    if not isinstance(cell_date, date) or cell_date not in fechas:
                        continue
                    datos["gastos"][cell_date].append({
                        "concepto": row[2] or "",
                        "valor": float(row[6] or 0),
                    })

            for ws in excel_service._obtener_hojas_para_lectura(wb, "prestamos"):
                for registro in excel_service._leer_movimientos_prestamos_desde_hoja(ws, fechas_objetivo=fechas):
                    try:
                        fecha_reg = date.fromisoformat(registro["fecha"])
                    except ValueError:
                        continue
                    datos["prestamos"][fecha_reg].append(registro)

            for ws in excel_service._obtener_hojas_para_lectura(wb, "movimientos"):
                for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                    if row[0] is None:
                        continue
                    cell_date = row[0]
                    if isinstance(cell_date, datetime):
                        cell_date = cell_date.date()
                    if not isinstance(cell_date, date) or cell_date not in fechas:
                        continue
                    hora = row[1]
                    if isinstance(hora, datetime):
                        hora_texto = hora.strftime("%I:%M %p")
                    else:
                        hora_texto = str(hora or "")
                    datos["movimientos"][cell_date].append({
                        "sheet_row": idx,
                        "fecha": cell_date.isoformat(),
                        "fecha_display": cell_date.strftime("%d-%m-%Y"),
                        "hora_display": hora_texto,
                        "tipo_movimiento": str(row[2] or "").strip().lower() or "salida",
                        "concepto": str(row[3] or "").strip(),
                        "valor": float(row[4] or 0),
                        "observacion": str(row[5] or "").strip(),
                        "fecha_hora_registro": row[6].isoformat() if isinstance(row[6], datetime) else str(row[6] or ""),
                    })

    return datos


def _encontrar_inicio_periodo(
    fecha_cuadre: date,
    fechas_caja: set[date] | None = None,
    fechas_contadores: set[date] | None = None,
) -> date:
    """
    Busca hacia atrás el último día anterior a fecha_cuadre que tenga
    AMBOS Caja y Contadores. El período comienza el día siguiente a ese corte.
    Si no se encuentra ninguno, arranca desde el primer día con cualquier dato.
    """
    if fechas_caja is None or fechas_contadores is None:
        year = fecha_cuadre.year
        years_to_check = list(dict.fromkeys([year, year - 1]))
        fechas = _cargar_fechas_modulos(["caja", "contadores"], years_to_check)
        fechas_caja = fechas["caja"]
        fechas_contadores = fechas["contadores"]

    dias_completos = sorted(
        [d for d in (fechas_caja & fechas_contadores) if d < fecha_cuadre],
        reverse=True,
    )
    if dias_completos:
        return dias_completos[0] + timedelta(days=1)

    limit = fecha_cuadre - timedelta(days=365)
    primera = _obtener_primera_fecha_operativa_desde(limit, fecha_cuadre)
    return primera if primera is not None else fecha_cuadre


def calcular_periodo(fecha_cuadre: date) -> list[date]:
    inicio = _encontrar_inicio_periodo(fecha_cuadre)
    dias: list[date] = []
    d = inicio
    while d <= fecha_cuadre:
        dias.append(d)
        d += timedelta(days=1)
    return dias


# ─── Resolución del período operativo ─────────────────────────────────────────

def resolver_periodo_operativo(fecha_cuadre: date) -> dict:
    """
    Construye el período operativo para fecha_cuadre y clasifica cada día:

    - dias_acumulados:      días sin Caja NI Contadores pero con datos acumulables.
                            Se arrastran al cuadre. No bloquean.
    - dias_inconsistentes:  días con solo uno de los dos (Caja sin Contadores o
                            viceversa). Error operativo. Bloquean el guardado.

    Regla de guardado:
        fecha_cuadre debe tener ambos (Caja + Contadores) y no debe haber
        dias_inconsistentes en el período.
    """
    MODULOS_ACUMULABLES = ["bonos", "gastos", "plataformas", "prestamos", "movimientos"]
    years_to_check = list(dict.fromkeys([fecha_cuadre.year, fecha_cuadre.year - 1]))
    fechas_por_modulo = _cargar_fechas_modulos(["caja", "contadores", *MODULOS_ACUMULABLES], years_to_check)
    inicio = _encontrar_inicio_periodo(
        fecha_cuadre,
        fechas_caja=fechas_por_modulo["caja"],
        fechas_contadores=fechas_por_modulo["contadores"],
    )

    periodo: list[date] = []
    d = inicio
    while d <= fecha_cuadre:
        periodo.append(d)
        d += timedelta(days=1)

    dias_acumulados: list[date] = []
    dias_inconsistentes: list[date] = []

    for d in periodo[:-1]:
        tiene_caja_d = d in fechas_por_modulo["caja"]
        tiene_cont_d = d in fechas_por_modulo["contadores"]

        if tiene_caja_d and tiene_cont_d:
            continue
        if not tiene_caja_d and not tiene_cont_d:
            has_data = any(d in fechas_por_modulo[m] for m in MODULOS_ACUMULABLES)
            if has_data:
                dias_acumulados.append(d)
        else:
            dias_inconsistentes.append(d)

    tiene_caja_dia = fecha_cuadre in fechas_por_modulo["caja"]
    tiene_cont_dia = fecha_cuadre in fechas_por_modulo["contadores"]

    puede_guardar = tiene_caja_dia and tiene_cont_dia and not dias_inconsistentes

    partes_info: list[str] = []
    partes_error: list[str] = []

    if dias_acumulados:
        fechas_str = ", ".join(_fmt(d) for d in dias_acumulados)
        partes_info.append(
            f"Se acumularon registros del {fechas_str} porque "
            f"{'ese día no tuvo' if len(dias_acumulados) == 1 else 'esos días no tuvieron'} "
            f"Caja ni Contadores."
        )

    if dias_inconsistentes:
        detalles: list[str] = []
        for d in dias_inconsistentes:
            tiene_c = d in fechas_por_modulo["caja"]
            falta = "Contadores" if tiene_c else "Caja"
            detalles.append(f"{_fmt(d)} falta {falta}")
        partes_error.append(
            f"Inconsistencia operativa: {'; '.join(detalles)}. "
            "Corrige esos días antes de guardar el cuadre."
        )

    if not tiene_caja_dia or not tiene_cont_dia:
        faltantes = []
        if not tiene_caja_dia:
            faltantes.append("Caja")
        if not tiene_cont_dia:
            faltantes.append("Contadores")
        partes_error.append(f"Falta {' y '.join(faltantes)} para el {_fmt(fecha_cuadre)}.")

    mensaje_info = " ".join(partes_info)
    mensaje_error = " ".join(partes_error)
    mensaje = " ".join(filter(None, [mensaje_info, mensaje_error])) or "OK"

    return {
        "ok": puede_guardar,
        "puede_guardar": puede_guardar,
        "periodo": [str(d) for d in periodo],
        "dias_acumulados": [str(d) for d in dias_acumulados],
        "dias_inconsistentes": [str(d) for d in dias_inconsistentes],
        "tiene_caja_dia": tiene_caja_dia,
        "tiene_contadores_dia": tiene_cont_dia,
        "tiene_base_anterior": False,
        "base_anterior": 0.0,
        "mensaje": mensaje,
        "mensaje_info": mensaje_info,
        "mensaje_error": mensaje_error,
        "fechas_sin_caja": [
            str(d) for d in dias_inconsistentes
            if d not in fechas_por_modulo["caja"]
        ],
    }


# ─── Precondiciones ───────────────────────────────────────────────────────────

def verificar_precondiciones(fecha_cuadre: date) -> dict:
    resultado = resolver_periodo_operativo(fecha_cuadre)
    valor_base = obtener_base_anterior_valor(fecha_cuadre)
    tiene_base = valor_base is not None
    resultado["tiene_base_anterior"] = tiene_base
    resultado["base_anterior"] = valor_base if tiene_base else 0.0
    return resultado


def calcular_cuadre(fecha_cuadre: date, base_anterior: float) -> dict:
    from app.services.contadores_service import obtener_catalogo
    from app.services.settings_service import get_settings

    periodo = calcular_periodo(fecha_cuadre)
    datos_periodo = _cargar_datos_periodo(periodo)
    catalogo_map = {item["item_id"]: item for item in obtener_catalogo()}
    excluir_monedas_viejos_base = bool(get_settings().get("excluir_monedas_viejos_base"))

    total_contadores = 0.0
    total_practisistemas = 0.0
    total_deportivas = 0.0
    total_bonos = 0.0
    total_gastos = 0.0
    total_prestamos_salida = 0.0
    total_prestamos_entrada = 0.0
    total_mov_ingresos = 0.0
    total_mov_salidas = 0.0

    contadores_por_item: dict[str, dict] = {}
    bonos_por_cliente: dict[str, float] = {}
    gastos_items: list[dict] = []
    prestamos_por_persona: dict[str, dict] = {}

    contadores_guardados = excel_service.obtener_datos_contadores_fecha(fecha_cuadre, fecha_cuadre.year)
    for item_id, item_data in contadores_guardados.items():
        resultado = float(item_data.get("resultado_monetario", 0))
        total_contadores += resultado
        if item_id not in contadores_por_item:
            contadores_por_item[item_id] = {
                "nombre": catalogo_map.get(item_id, {}).get("nombre", item_id),
                "resultado": 0.0,
                "yield_actual": 0,
            }
        contadores_por_item[item_id]["resultado"] += resultado
        contadores_por_item[item_id]["yield_actual"] = int(item_data.get("yield_actual", 0))

    for d in periodo:
        plataformas_data = datos_periodo["plataformas"].get(d)
        if plataformas_data:
            total_practisistemas += float(plataformas_data.get("venta_practisistemas", 0))
            total_deportivas += float(plataformas_data.get("venta_deportivas", 0))

        for b in datos_periodo["bonos"].get(d, []):
            valor = float(b.get("valor", 0))
            total_bonos += valor
            cliente = b.get("cliente", "")
            bonos_por_cliente[cliente] = bonos_por_cliente.get(cliente, 0.0) + valor

        for g in datos_periodo["gastos"].get(d, []):
            gastos_items.append({"concepto": g.get("concepto", ""), "valor": float(g.get("valor", 0))})
            total_gastos += float(g.get("valor", 0))

        for p in datos_periodo["prestamos"].get(d, []):
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

        for m in datos_periodo["movimientos"].get(d, []):
            valor = float(m.get("valor", 0))
            if m.get("tipo_movimiento") == "ingreso":
                total_mov_ingresos += valor
            else:
                total_mov_salidas += valor

    caja_fisica_data = excel_service.obtener_datos_caja_fecha(fecha_cuadre, fecha_cuadre.year)
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

    neto_prestamos = total_prestamos_entrada - total_prestamos_salida
    neto_movimientos = total_mov_ingresos - total_mov_salidas
    base_nueva = round(
        caja_fisica - caja_desglose["total_monedas"] - caja_desglose["billetes_viejos"],
        2,
    ) if excluir_monedas_viejos_base else caja_fisica

    caja_teorica = round(
        base_anterior
        + total_contadores
        + total_practisistemas
        + total_deportivas
        - total_bonos
        - total_gastos
        + neto_prestamos
        + neto_movimientos,
        2,
    )
    diferencia = round(caja_fisica - caja_teorica, 2)

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
        "fecha_inicio_periodo": str(periodo[0]) if periodo else str(fecha_cuadre),
        "base_anterior": base_anterior,
        "contadores": {
            "items": [{"item_id": k, **v} for k, v in contadores_por_item.items()],
            "total": total_contadores,
        },
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
            "neto": neto_prestamos,
        },
        "movimientos": {
            "total_ingresos": total_mov_ingresos,
            "total_salidas": total_mov_salidas,
            "neto": neto_movimientos,
        },
        "caja_desglose": caja_desglose,
        "caja_fisica": caja_fisica,
        "caja_teorica": caja_teorica,
        "diferencia": diferencia,
        "base_nueva": base_nueva,
    }


def guardar_cuadre(entrada, base_anterior: float) -> dict:
    fecha = entrada.fecha
    year = fecha.year

    if not entrada.forzar and excel_service.fecha_existe_modulo("cuadre", fecha, year):
        return {"ok": False, "mensaje": f"Ya existe un Cuadre para {fecha}.", "fecha": str(fecha)}

    datos = calcular_cuadre(fecha, base_anterior)
    timestamp_dt = datetime.now().replace(microsecond=0)

    fila = [
        fecha,
        datos["fecha_inicio_periodo"],
        round(datos["base_anterior"], 2),
        round(datos["contadores"]["total"], 2),
        round(datos["plataformas"]["total_practisistemas"], 2),
        round(datos["plataformas"]["total_deportivas"], 2),
        round(datos["bonos"]["total"], 2),
        round(datos["gastos"]["total"], 2),
        round(datos["prestamos"]["total_salida"], 2),
        round(datos["prestamos"]["total_entrada"], 2),
        round(datos["prestamos"]["neto"], 2),
        round(datos["movimientos"]["total_ingresos"], 2),
        round(datos["movimientos"]["total_salidas"], 2),
        round(datos["movimientos"]["neto"], 2),
        datos["caja_teorica"],
        datos["caja_fisica"],
        datos["diferencia"],
        datos["base_nueva"],
        timestamp_dt,
    ]

    reemplazar = fecha if entrada.forzar else None
    try:
        excel_service.guardar_filas_modulo("cuadre", [fila], year, reemplazar_fecha=reemplazar)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": str(fecha)}

    return {
        "ok": True,
        "mensaje": "Cuadre guardado correctamente",
        "fecha": str(fecha),
        "diferencia": datos["diferencia"],
        "base_nueva": datos["base_nueva"],
        "fecha_hora_registro": timestamp_dt.isoformat(),
    }


def buscar_fecha_cuadre_afectado(fecha_operacion: date) -> date | None:
    cuadre = excel_service.obtener_cuadre_que_contiene_fecha(fecha_operacion)
    if not cuadre:
        return None
    try:
        return date.fromisoformat(cuadre["fecha"])
    except ValueError:
        return None


def sincronizar_cuadre_guardado(fecha_cierre: date) -> dict:
    preconds = verificar_precondiciones(fecha_cierre)
    if not preconds["ok"] or not preconds["tiene_base_anterior"]:
        return {
            "ok": False,
            "recalculado": False,
            "fecha_cuadre": str(fecha_cierre),
            "mensaje": (
                f"La corrección afecta el Cuadre de {_fmt(fecha_cierre)}, "
                "pero ya no cumple precondiciones y requiere revisión manual."
            ),
        }

    entrada = SimpleNamespace(fecha=fecha_cierre, forzar=True)
    resultado = guardar_cuadre(entrada, float(preconds["base_anterior"] or 0))
    if resultado.get("ok"):
        return {
            "ok": True,
            "recalculado": True,
            "fecha_cuadre": str(fecha_cierre),
            "mensaje": f"Cuadre de {_fmt(fecha_cierre)} recalculado automáticamente.",
        }
    return {
        "ok": False,
        "recalculado": False,
        "fecha_cuadre": str(fecha_cierre),
        "mensaje": resultado.get("mensaje") or f"No se pudo resincronizar el Cuadre de {_fmt(fecha_cierre)}.",
    }


def sincronizar_cuadre_afectado(fecha_operacion: date) -> dict | None:
    fecha_cierre = buscar_fecha_cuadre_afectado(fecha_operacion)
    if fecha_cierre is None:
        return None
    return sincronizar_cuadre_guardado(fecha_cierre)


def sincronizar_cadena_caja(fecha_operacion: date) -> dict | None:
    fecha_cierre = buscar_fecha_cuadre_afectado(fecha_operacion)
    if fecha_cierre is None:
        return None

    mensajes: list[str] = []

    datos_antes = excel_service.obtener_datos_cuadre_fecha(fecha_cierre, fecha_cierre.year)
    base_nueva_antes = (
        float(datos_antes["base_nueva"])
        if datos_antes and datos_antes.get("base_nueva") is not None
        else None
    )

    sync_result = sincronizar_cuadre_guardado(fecha_cierre)
    if sync_result and sync_result.get("mensaje"):
        mensajes.append(sync_result["mensaje"])
    if not sync_result or not sync_result.get("ok"):
        return {
            "ok": False,
            "recalculado": False,
            "fecha_cuadre": str(fecha_cierre),
            "mensaje": " ".join(mensajes).strip(),
        }

    datos_despues = excel_service.obtener_datos_cuadre_fecha(fecha_cierre, fecha_cierre.year)
    base_nueva_despues = (
        float(datos_despues["base_nueva"])
        if datos_despues and datos_despues.get("base_nueva") is not None
        else None
    )

    cambio_base = (
        base_nueva_antes is None
        or base_nueva_despues is None
        or abs(base_nueva_despues - base_nueva_antes) >= 0.01
    )
    if not cambio_base:
        return {
            "ok": True,
            "recalculado": True,
            "fecha_cuadre": str(fecha_cierre),
            "mensaje": " ".join(mensajes).strip(),
        }

    siguiente = excel_service.obtener_siguiente_cuadre(fecha_cierre)
    if not siguiente:
        return {
            "ok": True,
            "recalculado": True,
            "fecha_cuadre": str(fecha_cierre),
            "mensaje": " ".join(mensajes).strip(),
        }

    try:
        fecha_siguiente = date.fromisoformat(siguiente["fecha"])
    except ValueError:
        return {
            "ok": True,
            "recalculado": True,
            "fecha_cuadre": str(fecha_cierre),
            "mensaje": " ".join(mensajes).strip(),
        }

    sync_siguiente = sincronizar_cuadre_guardado(fecha_siguiente)
    if sync_siguiente and sync_siguiente.get("mensaje"):
        mensajes.append(sync_siguiente["mensaje"])

    if not sync_siguiente or not sync_siguiente.get("ok"):
        return {
            "ok": False,
            "recalculado": True,
            "fecha_cuadre": str(fecha_siguiente),
            "mensaje": " ".join(mensajes).strip(),
        }

    return {
        "ok": True,
        "recalculado": True,
        "fecha_cuadre": str(fecha_cierre),
        "mensaje": " ".join(mensajes).strip(),
    }


def anexar_mensaje_sync(mensaje_base: str, sync_result: dict | None) -> str:
    if not sync_result or not sync_result.get("mensaje"):
        return mensaje_base
    return f"{mensaje_base}. {sync_result['mensaje']}"


def autoguardar_cuadre_si_listo(fecha: date) -> dict | None:
    """Sincroniza el Cuadre derivado cuando ya existen Caja y Contadores del día.

    Solo se ejecuta si la base anterior ya está resuelta por un cuadre previo
    o por startup_state; cuando la base requiere ingreso manual se omite.
    """
    year = fecha.year
    if not excel_service.fecha_existe_modulo("caja", fecha, year):
        return None
    if not excel_service.fecha_existe_modulo("contadores", fecha, year):
        return None

    preconds = verificar_precondiciones(fecha)
    if not preconds["ok"] or not preconds["tiene_base_anterior"]:
        return None

    entrada = SimpleNamespace(
        fecha=fecha,
        forzar=excel_service.fecha_existe_modulo("cuadre", fecha, year),
    )
    return guardar_cuadre(entrada, float(preconds["base_anterior"] or 0))
