import json
from pathlib import Path

from app.config import BASE_DIR

NOMBRES_PATH = BASE_DIR / "bonos_clientes.json"


def _normalizar_nombre(nombre: str) -> str:
    return " ".join(str(nombre or "").strip().split())


def obtener_nombres() -> list[str]:
    if not NOMBRES_PATH.exists():
        return []
    try:
        with open(NOMBRES_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            return []
        return sorted({_normalizar_nombre(x) for x in data if _normalizar_nombre(x)})
    except Exception:
        return []


def guardar_nombres(nombres: list[str]) -> None:
    limpios = sorted({_normalizar_nombre(x) for x in nombres if _normalizar_nombre(x)})
    with open(NOMBRES_PATH, "w", encoding="utf-8") as f:
        json.dump(limpios, f, indent=2, ensure_ascii=False)


def agregar_nombre(nombre: str) -> None:
    limpio = _normalizar_nombre(nombre)
    if not limpio:
        return
    nombres = obtener_nombres()
    if limpio not in nombres:
        nombres.append(limpio)
        guardar_nombres(nombres)


def importar_desde_txt(path: str) -> int:
    archivo = Path(path)
    if not archivo.exists():
        return 0
    contenido = archivo.read_text(encoding="utf-8", errors="ignore")
    actuales = obtener_nombres()
    nuevos = {_normalizar_nombre(linea) for linea in contenido.splitlines() if _normalizar_nombre(linea)}
    total_antes = len(actuales)
    guardar_nombres(actuales + list(nuevos))
    return len(obtener_nombres()) - total_antes
