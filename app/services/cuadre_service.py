from datetime import date, datetime, timedelta

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

def _encontrar_inicio_periodo(fecha_cuadre: date) -> date:
    """
    Busca hacia atrás el último día anterior a fecha_cuadre que tenga
    AMBOS Caja y Contadores. El período comienza el día siguiente a ese corte.
    Si no se encuentra ninguno, arranca desde el primer día con cualquier dato.
    """
    year = fecha_cuadre.year
    years_to_check = list(dict.fromkeys([year, year - 1]))

    fechas_caja: set[date] = set()
    fechas_contadores: set[date] = set()

    for y in years_to_check:
        for f in excel_service.obtener_fechas_modulo_año("caja", y):
            try:
                fechas_caja.add(date.fromisoformat(f))
            except ValueError:
                pass
        for f in excel_service.obtener_fechas_modulo_año("contadores", y):
            try:
                fechas_contadores.add(date.fromisoformat(f))
            except ValueError:
                pass

    # Días anteriores a fecha_cuadre con ambos módulos completos
    dias_completos = sorted(
        [d for d in (fechas_caja & fechas_contadores) if d < fecha_cuadre],
        reverse=True,
    )
    if dias_completos:
        return dias_completos[0] + timedelta(days=1)

    # Sin cierre previo — arrancar desde el primer dato operativo disponible
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
    inicio = _encontrar_inicio_periodo(fecha_cuadre)

    periodo: list[date] = []
    d = inicio
    while d <= fecha_cuadre:
        periodo.append(d)
        d += timedelta(days=1)

    MODULOS_ACUMULABLES = ["bonos", "gastos", "plataformas", "prestamos", "movimientos"]

    dias_acumulados: list[date] = []
    dias_inconsistentes: list[date] = []

    for d in periodo[:-1]:  # días anteriores a fecha_cuadre
        tiene_caja_d = excel_service.fecha_existe_modulo("caja", d, d.year)
        tiene_cont_d = excel_service.fecha_existe_modulo("contadores", d, d.year)

        if tiene_caja_d and tiene_cont_d:
            # No debería ocurrir por construcción, pero se ignora defensivamente
            continue
        elif not tiene_caja_d and not tiene_cont_d:
            has_data = any(
                excel_service.fecha_existe_modulo(m, d, d.year)
                for m in MODULOS_ACUMULABLES
            )
            if has_data:
                dias_acumulados.append(d)
        else:
            # Solo uno de los dos — inconsistencia operativa
            dias_inconsistentes.append(d)

    tiene_caja_dia = excel_service.fecha_existe_modulo("caja", fecha_cuadre, fecha_cuadre.year)
    tiene_cont_dia = excel_service.fecha_existe_modulo("contadores", fecha_cuadre, fecha_cuadre.year)

    puede_guardar = tiene_caja_dia and tiene_cont_dia and not dias_inconsistentes

    # ── Mensajes ──────────────────────────────────────────────────────────────
    partes_info: list[str] = []
    partes_error: list[str] = []

    if dias_acumulados:
        fechas_str = ", ".join(_fmt(d) for d in dias_acumulados)
        label = "día" if len(dias_acumulados) == 1 else "días"
        partes_info.append(
            f"Se acumularon registros del {fechas_str} porque "
            f"{'ese día no tuvo' if len(dias_acumulados) == 1 else 'esos días no tuvieron'} "
            f"Caja ni Contadores."
        )

    if dias_inconsistentes:
        detalles: list[str] = []
        for d in dias_inconsistentes:
            tiene_c = excel_service.fecha_existe_modulo("caja", d, d.year)
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
        partes_error.append(
            f"Falta {' y '.join(faltantes)} para el {_fmt(fecha_cuadre)}."
        )

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
        "tiene_base_anterior": False,   # lo rellena verificar_precondiciones
        "base_anterior": 0.0,
        "mensaje": mensaje,
        "mensaje_info": mensaje_info,
        "mensaje_error": mensaje_error,
        "fechas_sin_caja": [
            str(d) for d in dias_inconsistentes
            if not excel_service.fecha_existe_modulo("caja", d, d.year)
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


# ─── Cálculo del cuadre ───────────────────────────────────────────────────────

def calcular_cuadre(fecha_cuadre: date, base_anterior: float) -> dict:
    from app.services.contadores_service import obtener_catalogo

    periodo = calcular_periodo(fecha_cuadre)
    catalogo_map = {item["item_id"]: item for item in obtener_catalogo()}

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

    # ── Contadores: solo de fecha_cuadre ─────────────────────────────────────
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

    # ── Módulos acumulables: todo el período ──────────────────────────────────
    for d in periodo:
        # Plataformas
        plataformas_data = excel_service.obtener_datos_plataformas_fecha(d, d.year)
        if plataformas_data:
            total_practisistemas += float(plataformas_data.get("venta_practisistemas", 0))
            total_deportivas += float(plataformas_data.get("venta_deportivas", 0))

        # Bonos
        for b in excel_service.obtener_bonos_fecha(d, d.year):
            valor = float(b.get("valor", 0))
            total_bonos += valor
            cliente = b.get("cliente", "")
            bonos_por_cliente[cliente] = bonos_por_cliente.get(cliente, 0.0) + valor

        # Gastos
        gastos_data = excel_service.obtener_items_modulo_fecha("gastos", d, d.year)
        if gastos_data:
            for g in gastos_data.get("items", []):
                gastos_items.append({"concepto": g.get("concepto", ""), "valor": float(g.get("valor", 0))})
                total_gastos += float(g.get("valor", 0))

        # Préstamos
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

        # Movimientos
        for m in excel_service.obtener_movimientos_fecha(d, d.year):
            valor = float(m.get("valor", 0))
            if m.get("tipo_movimiento") == "ingreso":
                total_mov_ingresos += valor
            else:
                total_mov_salidas += valor

    # ── Caja física: solo de fecha_cuadre ────────────────────────────────────
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
        "base_nueva": caja_fisica,
    }


# ─── Guardado ─────────────────────────────────────────────────────────────────

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

    class _EntradaAutoguardado:
        def __init__(self, fecha_ref: date, forzar: bool):
            self.fecha = fecha_ref
            self.forzar = forzar

    entrada = _EntradaAutoguardado(
        fecha_ref=fecha,
        forzar=excel_service.fecha_existe_modulo("cuadre", fecha, year),
    )
    return guardar_cuadre(entrada, float(preconds["base_anterior"] or 0))
