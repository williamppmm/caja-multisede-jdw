import json
from pathlib import Path

from app.services.local_data_service import get_local_data_path

NOMBRES_PATH = get_local_data_path("bonos_clientes.json")
GASTOS_PATH = get_local_data_path("gastos_conceptos.json")
PRESTAMOS_PATH = get_local_data_path("prestamos_personas.json")
MOVIMIENTOS_PATH = get_local_data_path("movimientos_conceptos.json")

CATALOG_PATHS = {
    "bonos": NOMBRES_PATH,
    "gastos": GASTOS_PATH,
    "prestamos": PRESTAMOS_PATH,
    "movimientos": MOVIMIENTOS_PATH,
}


def _normalizar_nombre(nombre: str) -> str:
    return " ".join(str(nombre or "").strip().split())


def _normalizar_nombre_propio(nombre: str) -> str:
    limpio = _normalizar_nombre(nombre)
    return limpio.title() if limpio else ""


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
    raw = obtener_catalogo("bonos")
    return sorted({_normalizar_nombre_propio(n) for n in raw if n})


def guardar_nombres(nombres: list[str]) -> None:
    limpios = sorted({_normalizar_nombre_propio(n) for n in nombres if _normalizar_nombre_propio(n)})
    with open(_obtener_path("bonos"), "w", encoding="utf-8") as f:
        json.dump(limpios, f, indent=2, ensure_ascii=False)


def agregar_nombre(nombre: str) -> None:
    nombre_propio = _normalizar_nombre_propio(nombre)
    if not nombre_propio:
        return
    raw = obtener_catalogo("bonos")
    normalizados = {_normalizar_nombre_propio(n) for n in raw if n}
    if nombre_propio not in normalizados:
        normalizados.add(nombre_propio)
        with open(_obtener_path("bonos"), "w", encoding="utf-8") as f:
            json.dump(sorted(normalizados), f, indent=2, ensure_ascii=False)


def importar_desde_txt(path: str) -> int:
    return importar_catalogo_desde_txt("bonos", path)


def obtener_personas() -> list[str]:
    raw = obtener_catalogo("prestamos")
    return sorted({_normalizar_nombre_propio(n) for n in raw if n})


def agregar_persona(nombre: str) -> None:
    nombre_propio = _normalizar_nombre_propio(nombre)
    if not nombre_propio:
        return
    raw = obtener_catalogo("prestamos")
    normalizados = {_normalizar_nombre_propio(n) for n in raw if n}
    if nombre_propio not in normalizados:
        normalizados.add(nombre_propio)
        with open(_obtener_path("prestamos"), "w", encoding="utf-8") as f:
            json.dump(sorted(normalizados), f, indent=2, ensure_ascii=False)
