"""Registro local de acciones del super admin.

Guarda un .jsonl en APP_DATA_DIR (local al equipo super admin, no en Dropbox).
Cada línea es un objeto JSON con: fecha_hora, sede_id, sede_label, modulo,
fecha_afectada, accion.
"""
import json
from datetime import datetime

from app.services.local_data_service import get_local_data_path

AUDIT_PATH = get_local_data_path("super_admin_audit.jsonl")


def registrar(
    accion: str,
    modulo: str,
    fecha_afectada: str,
    sede_id: str = "",
    sede_label: str = "",
) -> None:
    entry = {
        "fecha_hora": datetime.now().replace(microsecond=0).isoformat(),
        "sede_id": sede_id,
        "sede_label": sede_label,
        "modulo": modulo,
        "fecha_afectada": fecha_afectada,
        "accion": accion,
    }
    try:
        with open(AUDIT_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


def obtener_log(limit: int = 200) -> list[dict]:
    if not AUDIT_PATH.exists():
        return []
    try:
        lineas = AUDIT_PATH.read_text(encoding="utf-8").splitlines()
        entries = []
        for linea in reversed(lineas):
            linea = linea.strip()
            if not linea:
                continue
            try:
                entries.append(json.loads(linea))
            except Exception:
                continue
            if len(entries) >= limit:
                break
        return entries
    except Exception:
        return []
