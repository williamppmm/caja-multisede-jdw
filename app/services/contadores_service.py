import json
import shutil
from datetime import date, datetime
from pathlib import Path

from app.models.contadores_models import ContadorCatalogoItem, ContadoresEntrada
from app.services import excel_service, startup_state_service
from app.services.local_data_service import get_local_data_path


_CATALOGO_FILENAME = "contadores_items.json"
_PAUSAS_FILENAME = "contadores_pausas.json"


def _get_pausas_path() -> Path:
    from app.config import get_excel_folder
    return get_excel_folder() / _PAUSAS_FILENAME


def _esta_pausado(item_id: str, fecha: date, pausas_data: dict) -> bool:
    eventos = pausas_data.get(item_id, [])
    if not eventos:
        return False
    fecha_str = str(fecha)
    previos = sorted([e for e in eventos if e["fecha"] <= fecha_str], key=lambda e: e["fecha"])
    if not previos:
        return False
    return previos[-1]["tipo"] == "pausa"


def _get_catalogo_path() -> Path:
    """Resuelve la ruta de contadores_items.json junto a los .xlsx de la sede activa.
    Si todavía vive en data/, lo migra automáticamente la primera vez.
    """
    from app.config import get_excel_folder

    target = get_excel_folder() / _CATALOGO_FILENAME
    if not target.exists():
        legacy = get_local_data_path(_CATALOGO_FILENAME)
        if legacy.exists():
            try:
                shutil.move(str(legacy), str(target))
            except Exception:
                return legacy
    return target


def _leer_json(path: Path, default):
    if not path.exists():
        return default
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return default


def _guardar_json(path: Path, data) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)


def _yield(entradas: int, salidas: int, jackpot: int) -> int:
    return int(entradas) - int(salidas) - int(jackpot)


def obtener_catalogo() -> list[dict]:
    data = _leer_json(_get_catalogo_path(), [])
    items = []
    for raw in data:
        try:
            item = ContadorCatalogoItem(**raw)
            items.append(item.model_dump())
        except Exception:
            continue
    return items


def guardar_catalogo(items: list[dict]) -> list[dict]:
    normalizados: list[dict] = []
    vistos: set[str] = set()

    for raw in items:
        item = ContadorCatalogoItem(**raw)
        key = item.item_id.strip().lower()
        if key in vistos:
            continue
        vistos.add(key)
        normalizados.append(item.model_dump())

    _guardar_json(_get_catalogo_path(), normalizados)
    return obtener_catalogo()


def pausar_item(item_id: str, pausado: bool, fecha: date) -> dict:
    data = _leer_json(_get_catalogo_path(), [])
    if not any(raw.get("item_id") == item_id for raw in data):
        return {"ok": False, "mensaje": f"Item '{item_id}' no encontrado en el catálogo."}
    pausas = _leer_json(_get_pausas_path(), {})
    eventos = [e for e in pausas.get(item_id, []) if e["fecha"] != str(fecha)]
    eventos.append({"tipo": "pausa" if pausado else "reactivacion", "fecha": str(fecha)})
    eventos.sort(key=lambda e: e["fecha"])
    pausas[item_id] = eventos
    _guardar_json(_get_pausas_path(), pausas)
    return {"ok": True, "item_id": item_id, "pausado": pausado, "fecha": str(fecha)}


def fecha_existe(fecha: date) -> bool:
    return excel_service.fecha_existe_modulo("contadores", fecha, fecha.year)


def obtener_ultima_fecha() -> date | None:
    return excel_service.obtener_ultima_fecha_modulo_global("contadores")


def _iter_referencias_previas(item_id: str, fecha_actual: date) -> list[dict]:
    """Devuelve todos los eventos (registro y referencia_critica) previos a fecha_actual para item_id,
    ordenados por fecha. El último evento es la referencia vigente."""
    catalogo = {item["item_id"]: item for item in obtener_catalogo()}
    nombre = catalogo.get(item_id, {}).get("nombre", item_id)
    eventos = []
    for evento in excel_service.obtener_historial_contadores(fecha_actual):
        if evento["item_id"] != item_id:
            continue
        evento["nombre"] = nombre
        eventos.append(evento)
    eventos.sort(key=lambda e: (e["fecha"], 1 if e["tipo"] == "referencia_critica" else 0))
    return eventos


def _construir_eventos_por_item(fecha_actual: date, catalogo: list[dict] | None = None) -> dict[str, list[dict]]:
    catalogo_map = {item["item_id"]: item for item in (catalogo or obtener_catalogo())}
    eventos_por_item: dict[str, list[dict]] = {}
    for evento in excel_service.obtener_historial_contadores(fecha_actual):
        item_id = evento.get("item_id")
        if not item_id:
            continue
        evento = dict(evento)
        evento["nombre"] = catalogo_map.get(item_id, {}).get("nombre", item_id)
        eventos_por_item.setdefault(item_id, []).append(evento)

    for eventos in eventos_por_item.values():
        eventos.sort(key=lambda e: (e["fecha"], 1 if e["tipo"] == "referencia_critica" else 0))

    return eventos_por_item


def obtener_referencia_vigente(item_id: str, fecha_actual: date, eventos_por_item: dict[str, list[dict]] | None = None) -> dict | None:
    eventos = eventos_por_item.get(item_id, []) if eventos_por_item is not None else _iter_referencias_previas(item_id, fecha_actual)
    registros = [evento for evento in eventos if evento.get("tipo") == "registro"]
    if not registros:
        startup_date = startup_state_service.get_startup_date()
        startup_ref = startup_state_service.get_startup_reference(item_id)
        if startup_date is not None and startup_ref and startup_date <= fecha_actual:
            return {
                "tipo": "referencia_inicial",
                "fecha": str(startup_date),
                "entradas": int(startup_ref.get("entradas", 0)),
                "salidas": int(startup_ref.get("salidas", 0)),
                "jackpot": int(startup_ref.get("jackpot", 0)),
                "yield": _yield(
                    startup_ref.get("entradas", 0),
                    startup_ref.get("salidas", 0),
                    startup_ref.get("jackpot", 0),
                ),
                "observacion": "referencia inicial",
            }
        return None
    return registros[-1]


def obtener_ultimo_registro_real(item_id: str, fecha_actual: date, eventos_por_item: dict[str, list[dict]] | None = None) -> dict | None:
    eventos = eventos_por_item.get(item_id, []) if eventos_por_item is not None else _iter_referencias_previas(item_id, fecha_actual)
    registros = [evento for evento in eventos if evento.get("tipo") == "registro"]
    if not registros:
        return None
    return registros[-1]


def construir_base_fecha(fecha: date) -> dict:
    catalogo = obtener_catalogo()
    pausas_data = _leer_json(_get_pausas_path(), {})
    eventos_por_item = _construir_eventos_por_item(fecha, catalogo)
    guardados = excel_service.obtener_datos_contadores_fecha(fecha, fecha.year)
    existe = bool(guardados)
    filas = []
    fecha_hora_registro = ""

    for item in catalogo:
        ultimo_registro = obtener_ultimo_registro_real(item["item_id"], fecha, eventos_por_item)
        guardado = guardados.get(item["item_id"], {})
        ref = obtener_referencia_vigente(item["item_id"], fecha, eventos_por_item)

        if guardado.get("ref_entradas") is not None:
            ref = {
                "tipo": "referencia_critica",
                "fecha": str(fecha),
                "entradas": int(guardado.get("ref_entradas") or 0),
                "salidas": int(guardado.get("ref_salidas") or 0),
                "jackpot": int(guardado.get("ref_jackpot") or 0),
                "yield": int(guardado.get("yield_referencia") or 0),
                "observacion": guardado.get("observacion", ""),
            }

        esta_pausado_hoy = _esta_pausado(item["item_id"], fecha, pausas_data)

        jackpot_heredado = int(
            ultimo_registro.get("jackpot", ref.get("jackpot", 0) if ref else 0)
            if ultimo_registro else (ref.get("jackpot", 0) if ref else 0)
        )
        if esta_pausado_hoy and not guardado and ref:
            actual_entradas = int(ref.get("entradas", 0))
            actual_salidas = int(ref.get("salidas", 0))
            actual_jackpot = jackpot_heredado
        else:
            actual_entradas = int(guardado.get("entradas", 0))
            actual_salidas = int(guardado.get("salidas", 0))
            actual_jackpot = int(guardado.get("jackpot", jackpot_heredado))

        yield_actual = _yield(actual_entradas, actual_salidas, actual_jackpot)
        yield_ref = int(ref.get("yield", 0)) if ref else 0
        alerta = (not esta_pausado_hoy) and bool(ref) and (
            actual_entradas < int(ref.get("entradas", 0))
            or actual_salidas < int(ref.get("salidas", 0))
            or actual_jackpot < int(ref.get("jackpot", 0))
        )

        resultado_unidades = int(guardado.get("resultado_unidades", yield_actual - yield_ref))
        resultado_monetario = float(guardado.get("resultado_monetario", (yield_actual - yield_ref) * int(item["denominacion"])))

        fhr = guardado.get("fecha_hora_registro", "")
        if fhr and not fecha_hora_registro:
            fecha_hora_registro = fhr

        usar_critica = guardado.get("ref_entradas") is not None
        observacion_guardada = guardado.get("observacion", "")

        filas.append({
            "item_id": item["item_id"],
            "nombre": item["nombre"],
            "denominacion": int(item["denominacion"]),
            "activo": bool(item.get("activo", True)),
            "entradas": actual_entradas,
            "salidas": actual_salidas,
            "jackpot": actual_jackpot,
            "yield_actual": yield_actual,
            "referencia": {
                "tipo": ref.get("tipo", "sin_referencia") if ref else "sin_referencia",
                "fecha": ref.get("fecha", "") if ref else "",
                "entradas": int(ref.get("entradas", 0)) if ref else 0,
                "salidas": int(ref.get("salidas", 0)) if ref else 0,
                "jackpot": int(ref.get("jackpot", 0)) if ref else 0,
                "yield": yield_ref,
                "observacion": ref.get("observacion", "") if ref else "",
            },
            "resultado_unidades": resultado_unidades,
            "resultado_monetario": resultado_monetario,
            "alerta": alerta,
            "usar_referencia_critica": usar_critica,
            "produccion_pre_reset_guardada": int(guardado.get("produccion_pre_reset", 0)),
            "observacion_referencia": observacion_guardada,
            "ref_entradas_guardada": guardado.get("ref_entradas"),
            "ref_salidas_guardada": guardado.get("ref_salidas"),
            "ref_jackpot_guardada": guardado.get("ref_jackpot"),
            "fecha_hora_registro": fhr,
            "pausado": esta_pausado_hoy,
        })

    total = sum(float(f["resultado_monetario"]) for f in filas if f.get("activo", True))
    return {
        "fecha": str(fecha),
        "existe": existe,
        "items": filas,
        "total_resultado": total,
        "cantidad_items": len(filas),
        "fecha_hora_registro": fecha_hora_registro,
    }


def guardar_contadores(entrada: ContadoresEntrada) -> dict:
    catalogo = {item["item_id"]: item for item in obtener_catalogo()}
    if not catalogo:
        return {
            "ok": False,
            "mensaje": "No hay items configurados en Contadores. Agrégalos desde Administración.",
            "fecha": str(entrada.fecha),
        }
    pausas_data = _leer_json(_get_pausas_path(), {})
    eventos_por_item = _construir_eventos_por_item(entrada.fecha, list(catalogo.values()))

    fecha_str = str(entrada.fecha)

    if not entrada.forzar and excel_service.fecha_existe_modulo("contadores", entrada.fecha, entrada.fecha.year):
        return {
            "ok": False,
            "mensaje": f"Ya existe un registro de Contadores para {fecha_str}.",
            "fecha": fecha_str,
        }

    filas_guardadas: list[dict] = []
    alertas = 0

    for fila in entrada.items:
        if fila.item_id not in catalogo:
            continue

        meta = catalogo[fila.item_id]

        if _esta_pausado(fila.item_id, entrada.fecha, pausas_data):
            ref_p = obtener_referencia_vigente(fila.item_id, entrada.fecha, eventos_por_item)
            if ref_p:
                ref_e = int(ref_p.get("entradas", 0))
                ref_s = int(ref_p.get("salidas", 0))
                ultimo_reg_p = obtener_ultimo_registro_real(fila.item_id, entrada.fecha, eventos_por_item)
                ref_j = int(
                    ultimo_reg_p.get("jackpot", ref_p.get("jackpot", 0))
                    if ultimo_reg_p else ref_p.get("jackpot", 0)
                )
                y_ref = int(ref_p.get("yield", 0))
                y_actual = _yield(ref_e, ref_s, ref_j)
                res_unidades = y_actual - y_ref
                filas_guardadas.append({
                    "item_id": fila.item_id,
                    "nombre": meta["nombre"],
                    "denominacion": int(meta["denominacion"]),
                    "entradas": ref_e,
                    "salidas": ref_s,
                    "jackpot": ref_j,
                    "yield_actual": y_actual,
                    "yield_referencia": y_ref,
                    "produccion_pre_reset": 0,
                    "resultado_unidades": res_unidades,
                    "resultado_monetario": float(res_unidades * int(meta["denominacion"])),
                    "observacion": "pausado",
                    "ref_entradas": None,
                    "ref_salidas": None,
                    "ref_jackpot": None,
                })
            continue

        observacion_ref = ""
        ref_entradas = None
        ref_salidas = None
        ref_jackpot = None
        ref = obtener_referencia_vigente(fila.item_id, entrada.fecha, eventos_por_item)
        ref_efectiva = ref

        if fila.usar_referencia_critica:
            if not entrada.forzar or fila.referencia_critica is None:
                return {
                    "ok": False,
                    "mensaje": f"El item {meta['nombre']} requiere autorización admin y referencia crítica completa.",
                    "fecha": fecha_str,
                }
            ref_crit = fila.referencia_critica
            ref_entradas = ref_crit.entradas
            ref_salidas = ref_crit.salidas
            ref_jackpot = ref_crit.jackpot
            ref_efectiva = {
                "tipo": "referencia_critica",
                "fecha": fecha_str,
                "entradas": ref_entradas,
                "salidas": ref_salidas,
                "jackpot": ref_jackpot,
                "yield": _yield(ref_entradas, ref_salidas, ref_jackpot),
            }
            observacion_ref = ref_crit.observacion

        alerta = bool(ref_efectiva) and (
            fila.entradas < int(ref_efectiva.get("entradas", 0))
            or fila.salidas < int(ref_efectiva.get("salidas", 0))
            or fila.jackpot < int(ref_efectiva.get("jackpot", 0))
        )
        if alerta:
            if fila.usar_referencia_critica:
                return {
                    "ok": False,
                    "mensaje": f"El item {meta['nombre']} sigue por debajo de la referencia crítica en Entradas, Salidas o Jackpot.",
                    "fecha": fecha_str,
                }
            alertas += 1
            continue

        yield_actual = _yield(fila.entradas, fila.salidas, fila.jackpot)
        yield_referencia = int(ref_efectiva.get("yield", 0)) if ref_efectiva else 0
        resultado_unidades = yield_actual - yield_referencia
        produccion_pre_reset = int(fila.produccion_pre_reset) if fila.usar_referencia_critica else 0
        resultado_monetario = resultado_unidades * int(meta["denominacion"]) + produccion_pre_reset

        filas_guardadas.append({
            "item_id": fila.item_id,
            "nombre": meta["nombre"],
            "denominacion": int(meta["denominacion"]),
            "entradas": fila.entradas,
            "salidas": fila.salidas,
            "jackpot": fila.jackpot,
            "yield_actual": yield_actual,
            "yield_referencia": yield_referencia,
            "produccion_pre_reset": produccion_pre_reset,
            "resultado_unidades": resultado_unidades,
            "resultado_monetario": resultado_monetario,
            "observacion": observacion_ref,
            "ref_entradas": ref_entradas,
            "ref_salidas": ref_salidas,
            "ref_jackpot": ref_jackpot,
        })

    if alertas:
        return {
            "ok": False,
            "mensaje": "Hay items con valores inferiores a su referencia vigente en Entradas, Salidas o Jackpot. Usa admin y registra referencia crítica para continuar.",
            "fecha": fecha_str,
            "alertas": alertas,
        }

    timestamp_dt = datetime.now().replace(microsecond=0)
    timestamp = timestamp_dt.isoformat()

    filas_excel = [
        [
            entrada.fecha,
            item["item_id"],
            item["nombre"],
            item["denominacion"],
            item["entradas"],
            item["salidas"],
            item["jackpot"],
            item["yield_actual"],
            item["ref_entradas"],    # None when no critical reference
            item["ref_salidas"],
            item["ref_jackpot"],
            item["yield_referencia"],
            item["produccion_pre_reset"],
            item["observacion"],
            item["resultado_monetario"],
            timestamp_dt,
        ]
        for item in filas_guardadas
    ]
    reemplazar = entrada.fecha if entrada.forzar else None
    try:
        excel_service.guardar_filas_modulo("contadores", filas_excel, entrada.fecha.year, reemplazar_fecha=reemplazar)
    except excel_service.ArchivoCajaOcupadoError as exc:
        return {"ok": False, "mensaje": str(exc), "fecha": fecha_str}

    total = sum(float(item["resultado_monetario"]) for item in filas_guardadas)
    from app.services import cuadre_service

    sync_result = cuadre_service.sincronizar_cuadre_afectado(entrada.fecha)
    fecha_fmt = entrada.fecha.strftime("%d-%m-%Y")
    mensaje = "Contadores guardados correctamente"
    if sync_result and sync_result.get("ok"):
        mensaje += f". Tus cambios han afectado el Cuadre del {fecha_fmt}"
    elif sync_result and not sync_result.get("ok"):
        mensaje += ". Tus cambios podrían no reflejarse en el Cuadre de inmediato"
    return {
        "ok": True,
        "mensaje": mensaje,
        "fecha": fecha_str,
        "total_resultado": total,
        "cantidad_items": len(filas_guardadas),
        "fecha_hora_registro": timestamp,
        "alertas": 0,
    }
