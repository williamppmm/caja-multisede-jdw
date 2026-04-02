import json
from datetime import date, datetime
from pathlib import Path

from app.config import BASE_DIR
from app.models.contadores_models import ContadorCatalogoItem, ContadoresEntrada
from app.services import excel_service


CATALOGO_PATH = BASE_DIR / "contadores_items.json"
REGISTROS_PATH = BASE_DIR / "contadores_registros.json"
REFERENCIAS_PATH = BASE_DIR / "contadores_referencias_criticas.json"


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


def _yield(entradas: int, salidas: int, jackpot: int, cancelled: int) -> int:
    return int(entradas) - int(salidas) - int(jackpot) - int(cancelled)


def obtener_catalogo() -> list[dict]:
    data = _leer_json(CATALOGO_PATH, [])
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

    _guardar_json(CATALOGO_PATH, normalizados)
    return obtener_catalogo()


def fecha_existe(fecha: date) -> bool:
    registros = _leer_json(REGISTROS_PATH, {})
    return str(fecha) in registros


def obtener_ultima_fecha() -> date | None:
    registros = _leer_json(REGISTROS_PATH, {})
    fechas_validas = []
    for fecha_str in registros.keys():
        try:
            fechas_validas.append(date.fromisoformat(fecha_str))
        except ValueError:
            continue
    return max(fechas_validas) if fechas_validas else None


def _iter_referencias_previas(item_id: str, fecha_actual: date) -> list[dict]:
    catalogo = {item["item_id"]: item for item in obtener_catalogo()}
    registros = _leer_json(REGISTROS_PATH, {})
    referencias = _leer_json(REFERENCIAS_PATH, [])
    eventos: list[dict] = []

    for fecha_str, registro in registros.items():
        try:
            fecha_registro = date.fromisoformat(fecha_str)
        except ValueError:
            continue
        if fecha_registro >= fecha_actual:
            continue
        for item in registro.get("items", []):
            if item.get("item_id") != item_id:
                continue
            eventos.append({
                "tipo": "registro",
                "fecha": fecha_str,
                "item_id": item_id,
                "entradas": int(item.get("entradas", 0)),
                "salidas": int(item.get("salidas", 0)),
                "jackpot": int(item.get("jackpot", 0)),
                "cancelled": int(item.get("cancelled", 0)),
                "yield": int(item.get("yield_actual", _yield(
                    item.get("entradas", 0),
                    item.get("salidas", 0),
                    item.get("jackpot", 0),
                    item.get("cancelled", 0),
                ))),
                "motivo": item.get("motivo_referencia") or "",
                "observacion": item.get("observacion_referencia") or "",
                "nombre": catalogo.get(item_id, {}).get("nombre", item_id),
            })

    for ref in referencias:
        if ref.get("item_id") != item_id:
            continue
        try:
            fecha_ref = date.fromisoformat(str(ref.get("fecha_efectiva")))
        except ValueError:
            continue
        if fecha_ref >= fecha_actual:
            continue
        eventos.append({
            "tipo": "referencia_critica",
            "fecha": str(ref.get("fecha_efectiva")),
            "item_id": item_id,
            "entradas": int(ref.get("entradas", 0)),
            "salidas": int(ref.get("salidas", 0)),
            "jackpot": int(ref.get("jackpot", 0)),
            "cancelled": int(ref.get("cancelled", 0)),
            "yield": int(ref.get("yield", _yield(
                ref.get("entradas", 0),
                ref.get("salidas", 0),
                ref.get("jackpot", 0),
                ref.get("cancelled", 0),
            ))),
            "motivo": ref.get("motivo") or "",
            "observacion": ref.get("observacion") or "",
            "nombre": catalogo.get(item_id, {}).get("nombre", item_id),
        })

    eventos.sort(key=lambda item: (item["fecha"], 1 if item["tipo"] == "referencia_critica" else 0))
    return eventos


def obtener_referencia_vigente(item_id: str, fecha_actual: date) -> dict | None:
    eventos = _iter_referencias_previas(item_id, fecha_actual)
    if not eventos:
        return None
    return eventos[-1]


def construir_base_fecha(fecha: date) -> dict:
    registros = _leer_json(REGISTROS_PATH, {})
    catalogo = obtener_catalogo()
    registro = registros.get(str(fecha))
    guardados = {item.get("item_id"): item for item in (registro or {}).get("items", [])}
    filas = []

    for item in catalogo:
        ref = obtener_referencia_vigente(item["item_id"], fecha)
        guardado = guardados.get(item["item_id"], {})
        actual_entradas = int(guardado.get("entradas", 0))
        actual_salidas = int(guardado.get("salidas", 0))
        actual_jackpot = int(guardado.get("jackpot", ref.get("jackpot", 0) if ref else 0))
        actual_cancelled = int(guardado.get("cancelled", ref.get("cancelled", 0) if ref else 0))
        yield_actual = _yield(actual_entradas, actual_salidas, actual_jackpot, actual_cancelled)
        yield_ref = int(ref.get("yield", 0)) if ref else 0
        alerta = bool(ref) and (
            actual_entradas < int(ref.get("entradas", 0))
            or actual_salidas < int(ref.get("salidas", 0))
        )

        filas.append({
            "item_id": item["item_id"],
            "nombre": item["nombre"],
            "denominacion": int(item["denominacion"]),
            "activo": bool(item.get("activo", True)),
            "entradas": actual_entradas,
            "salidas": actual_salidas,
            "jackpot": actual_jackpot,
            "cancelled": actual_cancelled,
            "yield_actual": yield_actual,
            "referencia": {
                "tipo": guardado.get("referencia_tipo", ref.get("tipo", "sin_referencia") if ref else "sin_referencia"),
                "fecha": guardado.get("referencia_fecha", ref.get("fecha", "") if ref else ""),
                "entradas": int(guardado.get("referencia_entradas", ref.get("entradas", 0) if ref else 0)),
                "salidas": int(guardado.get("referencia_salidas", ref.get("salidas", 0) if ref else 0)),
                "jackpot": int(guardado.get("referencia_jackpot", ref.get("jackpot", 0) if ref else 0)),
                "cancelled": int(guardado.get("referencia_cancelled", ref.get("cancelled", 0) if ref else 0)),
                "yield": int(guardado.get("yield_referencia", yield_ref)),
                "motivo": guardado.get("motivo_referencia", ref.get("motivo", "") if ref else ""),
                "observacion": guardado.get("observacion_referencia", ref.get("observacion", "") if ref else ""),
            },
            "resultado_unidades": int(guardado.get("resultado_unidades", yield_actual - yield_ref)),
            "resultado_monetario": float(guardado.get("resultado_monetario", (yield_actual - yield_ref) * int(item["denominacion"]))),
            "alerta": alerta,
            "usar_referencia_critica": bool(guardado.get("usar_referencia_critica", False)),
            "motivo_referencia": guardado.get("motivo_referencia", ""),
            "observacion_referencia": guardado.get("observacion_referencia", ""),
            "fecha_hora_registro": (registro or {}).get("fecha_hora_registro", ""),
        })

    total = sum(float(item["resultado_monetario"]) for item in filas if item.get("activo", True))
    return {
        "fecha": str(fecha),
        "existe": registro is not None,
        "items": filas,
        "total_resultado": total,
        "cantidad_items": len(filas),
        "fecha_hora_registro": (registro or {}).get("fecha_hora_registro", ""),
    }


def guardar_contadores(entrada: ContadoresEntrada) -> dict:
    catalogo = {item["item_id"]: item for item in obtener_catalogo()}
    if not catalogo:
        return {
            "ok": False,
            "mensaje": "No hay items configurados en Contadores. Agrégalos desde Administración.",
            "fecha": str(entrada.fecha),
        }

    registros = _leer_json(REGISTROS_PATH, {})
    referencias = _leer_json(REFERENCIAS_PATH, [])
    fecha_str = str(entrada.fecha)
    if fecha_str in registros and not entrada.forzar:
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
        ref = obtener_referencia_vigente(fila.item_id, entrada.fecha)
        alerta = bool(ref) and (
            fila.entradas < int(ref.get("entradas", 0))
            or fila.salidas < int(ref.get("salidas", 0))
        )
        if alerta and not fila.usar_referencia_critica:
            alertas += 1
            continue

        ref_efectiva = ref
        motivo_ref = ""
        observacion_ref = ""

        if fila.usar_referencia_critica:
            if not entrada.forzar or fila.referencia_critica is None:
                return {
                    "ok": False,
                    "mensaje": f"El item {meta['nombre']} requiere autorización admin y referencia crítica completa.",
                    "fecha": fecha_str,
                }
            ref_crit = fila.referencia_critica
            ref_efectiva = {
                "tipo": "referencia_critica",
                "fecha": fecha_str,
                "entradas": ref_crit.entradas,
                "salidas": ref_crit.salidas,
                "jackpot": ref_crit.jackpot,
                "cancelled": ref_crit.cancelled,
                "yield": _yield(ref_crit.entradas, ref_crit.salidas, ref_crit.jackpot, ref_crit.cancelled),
            }
            motivo_ref = ref_crit.motivo
            observacion_ref = ref_crit.observacion
            referencias.append({
                "item_id": fila.item_id,
                "fecha_efectiva": fecha_str,
                "entradas": ref_crit.entradas,
                "salidas": ref_crit.salidas,
                "jackpot": ref_crit.jackpot,
                "cancelled": ref_crit.cancelled,
                "yield": ref_efectiva["yield"],
                "motivo": ref_crit.motivo,
                "observacion": ref_crit.observacion,
                "fecha_hora_registro": datetime.now().replace(microsecond=0).isoformat(),
            })

        yield_actual = _yield(fila.entradas, fila.salidas, fila.jackpot, fila.cancelled)
        yield_referencia = int(ref_efectiva.get("yield", 0)) if ref_efectiva else 0
        resultado_unidades = yield_actual - yield_referencia
        resultado_monetario = resultado_unidades * int(meta["denominacion"])

        filas_guardadas.append({
            "item_id": fila.item_id,
            "nombre": meta["nombre"],
            "denominacion": int(meta["denominacion"]),
            "entradas": fila.entradas,
            "salidas": fila.salidas,
            "jackpot": fila.jackpot,
            "cancelled": fila.cancelled,
            "yield_actual": yield_actual,
            "referencia_tipo": ref_efectiva.get("tipo", "sin_referencia") if ref_efectiva else "sin_referencia",
            "referencia_fecha": ref_efectiva.get("fecha", "") if ref_efectiva else "",
            "referencia_entradas": int(ref_efectiva.get("entradas", 0)) if ref_efectiva else 0,
            "referencia_salidas": int(ref_efectiva.get("salidas", 0)) if ref_efectiva else 0,
            "referencia_jackpot": int(ref_efectiva.get("jackpot", 0)) if ref_efectiva else 0,
            "referencia_cancelled": int(ref_efectiva.get("cancelled", 0)) if ref_efectiva else 0,
            "yield_referencia": yield_referencia,
            "resultado_unidades": resultado_unidades,
            "resultado_monetario": resultado_monetario,
            "alerta": alerta,
            "usar_referencia_critica": fila.usar_referencia_critica,
            "motivo_referencia": motivo_ref,
            "observacion_referencia": observacion_ref,
        })

    if alertas:
        return {
            "ok": False,
            "mensaje": "Hay items con Entradas o Salidas inferiores a su referencia vigente. Usa admin y registra referencia crítica para continuar.",
            "fecha": fecha_str,
            "alertas": alertas,
        }

    timestamp_dt = datetime.now().replace(microsecond=0)
    timestamp = timestamp_dt.isoformat()
    registros[fecha_str] = {
        "fecha": fecha_str,
        "fecha_hora_registro": timestamp,
        "items": filas_guardadas,
    }
    _guardar_json(REGISTROS_PATH, registros)
    _guardar_json(REFERENCIAS_PATH, referencias)

    # Escribir en Excel (hoja Contadores{Sede} del libro anual)
    filas_excel = [
        [
            entrada.fecha,
            item["nombre"],
            item["denominacion"],
            item["entradas"],
            item["salidas"],
            item["jackpot"],
            item["cancelled"],
            item["yield_actual"],
            item["yield_referencia"],
            item["resultado_unidades"],
            item["resultado_monetario"],
            item.get("observacion_referencia") or item.get("motivo_referencia") or "",
            timestamp_dt,
        ]
        for item in filas_guardadas
    ]
    try:
        reemplazar = entrada.fecha if entrada.forzar else None
        excel_service.guardar_filas_modulo("contadores", filas_excel, entrada.fecha.year, reemplazar_fecha=reemplazar)
    except excel_service.ArchivoCajaOcupadoError as exc:
        # El JSON ya se guardó; solo advertimos en el mensaje.
        total = sum(float(item["resultado_monetario"]) for item in filas_guardadas)
        return {
            "ok": True,
            "mensaje": f"Contadores guardados (JSON), pero no se pudo escribir en Excel: {exc}",
            "fecha": fecha_str,
            "total_resultado": total,
            "cantidad_items": len(filas_guardadas),
            "fecha_hora_registro": timestamp,
            "alertas": 0,
        }

    total = sum(float(item["resultado_monetario"]) for item in filas_guardadas)
    return {
        "ok": True,
        "mensaje": "Contadores guardados correctamente",
        "fecha": fecha_str,
        "total_resultado": total,
        "cantidad_items": len(filas_guardadas),
        "fecha_hora_registro": timestamp,
        "alertas": 0,
    }
