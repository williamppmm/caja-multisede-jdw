import json
from pathlib import Path

from app.config import BASE_DIR

NOMBRES_PATH = BASE_DIR / "bonos_clientes.json"
GASTOS_PATH = BASE_DIR / "gastos_conceptos.json"

CATALOG_PATHS = {
    "bonos": NOMBRES_PATH,
    "gastos": GASTOS_PATH,
}


def _normalizar_nombre(nombre: str) -> str:
    return " ".join(str(nombre or "").strip().split())


def _obtener_path(tipo: str) -> Path:
    return CATALOG_PATHS.get(str(tipo or "").strip().lower(), NOMBRES_PATH)


def obtener_catalogo(tipo: str) -> list[str]:
    path = _obtener_path(tipo)
    if not path.exists():
        return []
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            return []
        return sorted({_normalizar_nombre(x) for x in data if _normalizar_nombre(x)})
    except Exception:
        return []


def guardar_catalogo(tipo: str, nombres: list[str]) -> None:
    limpios = sorted({_normalizar_nombre(x) for x in nombres if _normalizar_nombre(x)})
    with open(_obtener_path(tipo), "w", encoding="utf-8") as f:
        json.dump(limpios, f, indent=2, ensure_ascii=False)


def agregar_item_catalogo(tipo: str, nombre: str) -> None:
    limpio = _normalizar_nombre(nombre)
    if not limpio:
        return
    nombres = obtener_catalogo(tipo)
    if limpio not in nombres:
        nombres.append(limpio)
        guardar_catalogo(tipo, nombres)


def importar_catalogo_desde_txt(tipo: str, path: str) -> int:
    archivo = Path(path)
    if not archivo.exists():
        return 0
    contenido = archivo.read_text(encoding="utf-8", errors="ignore")
    actuales = obtener_catalogo(tipo)
    nuevos = {_normalizar_nombre(linea) for linea in contenido.splitlines() if _normalizar_nombre(linea)}
    total_antes = len(actuales)
    guardar_catalogo(tipo, actuales + list(nuevos))
    return len(obtener_catalogo(tipo)) - total_antes


def obtener_nombres() -> list[str]:
    return obtener_catalogo("bonos")


def guardar_nombres(nombres: list[str]) -> None:
    guardar_catalogo("bonos", nombres)


def agregar_nombre(nombre: str) -> None:
    agregar_item_catalogo("bonos", nombre)


def importar_desde_txt(path: str) -> int:
    return importar_catalogo_desde_txt("bonos", path)
