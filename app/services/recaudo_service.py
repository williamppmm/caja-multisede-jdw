import json
from datetime import date, timedelta
from pathlib import Path

from app.config import get_excel_folder
from app.services import excel_service
from app.services.operativa_config_service import get_operativa_config

_FILENAME = "recaudo_ciclos.json"


def _state_path() -> Path:
    return get_excel_folder() / _FILENAME


def _is_enabled() -> bool:
    return bool(get_operativa_config().get("excluir_monedas_viejos_base"))


def _default_state(start_date: date | None = None) -> dict:
    start = (start_date or date.today()).isoformat()
    return {
        "ciclo_actual": {
            "desde": start,
            "entregas": [],
        },
        "historial": [],
    }


def _normalize_entrega(raw: dict | None) -> dict | None:
    if not isinstance(raw, dict):
        return None
    fecha_raw = str(raw.get("fecha") or "").strip()
    try:
        fecha = date.fromisoformat(fecha_raw).isoformat()
    except ValueError:
        return None
    monto = round(float(raw.get("monto") or 0), 2)
    if monto <= 0:
        return None
    return {
        "fecha": fecha,
        "monto": monto,
        "nota": str(raw.get("nota") or "").strip(),
    }


def _normalize_history_item(raw: dict | None) -> dict | None:
    if not isinstance(raw, dict):
        return None
    try:
        desde = date.fromisoformat(str(raw.get("desde") or "")).isoformat()
        hasta = date.fromisoformat(str(raw.get("hasta") or "")).isoformat()
    except ValueError:
        return None
    entregas = [
        entrega
        for entrega in (_normalize_entrega(item) for item in raw.get("entregas", []))
        if entrega
    ]
    return {
        "desde": desde,
        "hasta": hasta,
        "total_monedas": round(float(raw.get("total_monedas") or 0), 2),
        "total_billetes_viejos": round(float(raw.get("total_billetes_viejos") or 0), 2),
        "total_recaudado": round(float(raw.get("total_recaudado") or 0), 2),
        "total_entregado": round(float(raw.get("total_entregado") or 0), 2),
        "pendiente_final": round(float(raw.get("pendiente_final") or 0), 2),
        "entregas": entregas,
    }


def _normalize_state(raw: dict | None) -> dict:
    if not isinstance(raw, dict):
        return _default_state()

    ciclo_actual = raw.get("ciclo_actual") if isinstance(raw.get("ciclo_actual"), dict) else {}
    desde_raw = str(ciclo_actual.get("desde") or "").strip()
    try:
        desde = date.fromisoformat(desde_raw)
    except ValueError:
        desde = date.today()
    entregas = [
        entrega
        for entrega in (_normalize_entrega(item) for item in ciclo_actual.get("entregas", []))
        if entrega
    ]
    historial = [
        item
        for item in (_normalize_history_item(item) for item in raw.get("historial", []))
        if item
    ]
    return {
        "ciclo_actual": {
            "desde": desde.isoformat(),
            "entregas": entregas,
        },
        "historial": historial,
    }


def _load_state() -> dict:
    path = _state_path()
    if not path.exists():
        return _default_state()
    try:
        with open(path, encoding="utf-8") as f:
            return _normalize_state(json.load(f))
    except Exception:
        return _default_state()


def _save_state(state: dict) -> dict:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = _normalize_state(state)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(normalized, f, indent=2, ensure_ascii=False)
    return normalized


def _ensure_state() -> dict:
    state = _load_state()
    path = _state_path()
    if not path.exists():
        return _save_state(state)
    return state


def _iter_cycle_dates(start: date, end: date) -> list[date]:
    fechas = []
    current = start
    while current <= end:
        fechas.append(current)
        current += timedelta(days=1)
    return fechas


def _build_cycle_daily(start_date: date, end_date: date) -> tuple[list[dict], float, float]:
    diarios = []
    total_monedas = 0.0
    total_viejos = 0.0

    for fecha in _iter_cycle_dates(start_date, end_date):
        datos = excel_service.obtener_datos_caja_fecha(fecha, fecha.year)
        if not datos:
            continue
        monedas = round(float(datos.get("total_monedas") or 0), 2)
        viejos = round(float(datos.get("billetes_viejos") or 0), 2)
        total = round(monedas + viejos, 2)
        if total <= 0:
            continue
        diarios.append({
            "fecha": fecha.isoformat(),
            "monedas": monedas,
            "billetes_viejos": viejos,
            "total": total,
        })
        total_monedas += monedas
        total_viejos += viejos

    return diarios, round(total_monedas, 2), round(total_viejos, 2)


def _get_latest_closed_cycle(state: dict) -> dict | None:
    historial = state.get("historial", [])
    latest = None
    latest_hasta = None
    for item in historial:
        try:
            hasta = date.fromisoformat(str(item.get("hasta") or ""))
        except ValueError:
            continue
        if latest_hasta is None or hasta > latest_hasta:
            latest_hasta = hasta
            latest = item
    return latest


def get_recaudo_resumen(fecha_corte: date | None = None) -> dict:
    if not _is_enabled():
        return {
            "enabled": False,
            "mensaje": "La sede activa no usa recaudo separado de monedas y billetes viejos.",
        }

    state = _ensure_state()
    hoy = date.today()
    hasta_consulta = min(fecha_corte or hoy, hoy)

    ciclo_actual = state.get("ciclo_actual") or {}
    desde_actual_raw = str(ciclo_actual.get("desde") or "").strip()
    try:
        desde_actual = date.fromisoformat(desde_actual_raw)
    except ValueError:
        desde_actual = hoy
    if desde_actual > hoy:
        state["ciclo_actual"]["desde"] = hoy.isoformat()
        state = _save_state(state)
        desde_actual = hoy

    ultimo_cierre = _get_latest_closed_cycle(state)

    modo = "actual"
    if hasta_consulta >= desde_actual:
        ciclo = {
            "desde": desde_actual.isoformat(),
            "hasta": None,
            "entregas": list(ciclo_actual.get("entregas", [])),
        }
        desde = desde_actual
        hasta = hasta_consulta
        entregas_base = list(ciclo_actual.get("entregas", []))
    else:
        ciclo = None
        desde = None
        hasta = None
        entregas_base = []
        if ultimo_cierre:
            try:
                ultimo_desde = date.fromisoformat(str(ultimo_cierre.get("desde") or ""))
                ultimo_hasta = date.fromisoformat(str(ultimo_cierre.get("hasta") or ""))
            except ValueError:
                ultimo_desde = None
                ultimo_hasta = None
            if ultimo_desde and ultimo_hasta and ultimo_desde <= hasta_consulta <= ultimo_hasta:
                modo = "ultimo_cerrado"
                ciclo = {
                    "desde": ultimo_desde.isoformat(),
                    "hasta": ultimo_hasta.isoformat(),
                    "entregas": list(ultimo_cierre.get("entregas", [])),
                }
                desde = ultimo_desde
                hasta = hasta_consulta
                entregas_base = list(ultimo_cierre.get("entregas", []))

        if not ciclo or not desde or not hasta:
            return {
                "enabled": False,
                "mensaje": "No hay un ciclo visible para la fecha consultada.",
                "fecha_corte": hasta_consulta.isoformat(),
            }

    diarios, total_monedas, total_viejos = _build_cycle_daily(desde, hasta)
    total_recaudado = round(total_monedas + total_viejos, 2)
    entregas = sorted(
        [
            item
            for item in entregas_base
            if date.fromisoformat(item["fecha"]) <= hasta
        ],
        key=lambda item: item["fecha"],
        reverse=True,
    )
    total_entregado = round(sum(float(item.get("monto") or 0) for item in entregas), 2)
    pendiente = round(total_recaudado - total_entregado, 2)
    dias_ciclo = (hasta - desde).days + 1 if hasta >= desde else 0

    return {
        "enabled": True,
        "modo": modo,
        "fecha_corte": hasta.isoformat(),
        "ciclo_actual": {
            "desde": desde.isoformat(),
            "hasta": ciclo.get("hasta"),
            "dias_ciclo": dias_ciclo,
            "dias_con_recaudo": len(diarios),
            "entregas": entregas,
        },
        "ultimo_cierre": ultimo_cierre,
        "totales": {
            "monedas": total_monedas,
            "billetes_viejos": total_viejos,
            "recaudado": total_recaudado,
            "entregado": total_entregado,
            "pendiente": pendiente,
        },
        "diarios": diarios,
        "historial": state.get("historial", []),
    }


def registrar_entrega(fecha: date, monto: float, nota: str = "") -> dict:
    if not _is_enabled():
        return {"ok": False, "mensaje": "La sede activa no usa recaudo separado."}

    resumen = get_recaudo_resumen()
    if not resumen.get("enabled"):
        return {"ok": False, "mensaje": "No hay recaudo activo para esta sede."}

    monto = round(float(monto or 0), 2)
    if monto <= 0:
        return {"ok": False, "mensaje": "El monto de la entrega debe ser mayor a cero."}

    pendiente = float(resumen["totales"]["pendiente"])
    if monto > pendiente + 0.01:
        return {"ok": False, "mensaje": "La entrega no puede superar el pendiente actual."}

    state = _ensure_state()
    state["ciclo_actual"]["entregas"].append({
        "fecha": fecha.isoformat(),
        "monto": monto,
        "nota": str(nota or "").strip(),
    })
    _save_state(state)
    return {"ok": True, "mensaje": "Entrega registrada correctamente."}


def cerrar_ciclo(fecha_cierre: date | None = None) -> dict:
    if not _is_enabled():
        return {"ok": False, "mensaje": "La sede activa no usa recaudo separado."}

    resumen = get_recaudo_resumen()
    if not resumen.get("enabled"):
        return {"ok": False, "mensaje": "No hay recaudo activo para esta sede."}

    cierre = fecha_cierre or date.today()
    state = _ensure_state()
    ciclo = state["ciclo_actual"]
    state.setdefault("historial", []).append({
        "desde": ciclo["desde"],
        "hasta": cierre.isoformat(),
        "total_monedas": resumen["totales"]["monedas"],
        "total_billetes_viejos": resumen["totales"]["billetes_viejos"],
        "total_recaudado": resumen["totales"]["recaudado"],
        "total_entregado": resumen["totales"]["entregado"],
        "pendiente_final": resumen["totales"]["pendiente"],
        "entregas": ciclo.get("entregas", []),
    })
    state["ciclo_actual"] = {
        "desde": cierre.isoformat(),
        "entregas": [],
    }
    _save_state(state)
    return {"ok": True, "mensaje": "Ciclo de recaudo cerrado correctamente."}
