import os
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

from app.config import ENCABEZADOS, HOJA_REGISTROS, get_excel_path
from app.services.settings_service import get_settings


class ArchivoCajaOcupadoError(Exception):
    pass


SECTION_PREFIXES = {
    "caja": "Caja",
    "gastos": "Gastos",
    "bonos": "Bonos",
    "contadores": "Contadores",
}

BONOS_HEADERS = [
    "fecha",
    "hora",
    "cliente",
    "valor_bono",
    "fecha_hora_registro",
]

CONTADORES_HEADERS = [
    "fecha",
    "nombre",
    "denominacion",
    "entradas",
    "salidas",
    "jackpot",
    "cancelled",
    "yield_actual",
    "yield_referencia",
    "resultado_unidades",
    "resultado_monetario",
    "observacion",
    "fecha_hora_registro",
]


def _abrir_o_crear_workbook(path: Path):
    if path.exists():
        try:
            return load_workbook(path)
        except PermissionError as exc:
            raise ArchivoCajaOcupadoError(
                "El libro de Excel esta ocupado por otro proceso. Intenta guardar de nuevo en unos segundos."
            ) from exc
    wb = Workbook()
    wb.remove(wb.active)
    return wb


def _normalizar_nombre_hoja(nombre: str | None) -> str:
    base = (nombre or "").strip() or "Principal"
    invalidos = set(':\\/?*[]')
    limpio = "".join("_" if ch in invalidos else ch for ch in base)
    return limpio[:31].strip() or "Principal"


def _obtener_nombre_sede() -> str:
    return _normalizar_nombre_hoja(get_settings().get("sede"))


def _obtener_nombre_hoja_seccion(seccion: str) -> str:
    prefijo = SECTION_PREFIXES.get(seccion, seccion.title())
    return _normalizar_nombre_hoja(f"{prefijo}{_obtener_nombre_sede()}")


def obtener_hojas_activas() -> dict[str, str]:
    enabled = get_settings().get("enabled_modules") or ["caja"]
    return {
        modulo: _obtener_nombre_hoja_seccion(modulo)
        for modulo in enabled
        if modulo in SECTION_PREFIXES
    }


def _nombres_unicos(nombres: list[str]) -> list[str]:
    vistos = set()
    resultado = []
    for nombre in nombres:
        if not nombre or nombre in vistos:
            continue
        vistos.add(nombre)
        resultado.append(nombre)
    return resultado


def _nombres_legacy_caja() -> list[str]:
    return _nombres_unicos([
        _obtener_nombre_sede(),
        HOJA_REGISTROS,
    ])


def _nombres_lectura_modulo(modulo: str) -> list[str]:
    if modulo == "caja":
        return _nombres_unicos([
            _obtener_nombre_hoja_seccion("caja"),
            *_nombres_legacy_caja(),
        ])
    if modulo == "gastos":
        return _nombres_unicos([
            _obtener_nombre_hoja_seccion("gastos"),
            _obtener_nombre_hoja_seccion("caja"),
            *_nombres_legacy_caja(),
        ])
    return _nombres_unicos([_obtener_nombre_hoja_seccion(modulo)])


def _fila_es_modulo(modulo: str, row) -> bool:
    if modulo in {"bonos", "contadores"}:
        return True
    tipo = row[1]
    if modulo == "caja":
        return tipo not in {"gasto", "bono"}
    if modulo == "gastos":
        return tipo == "gasto"
    return False


@contextmanager
def _bloqueo_escritura(path: Path):
    lock_path = path.with_suffix(path.suffix + ".lock")
    fd = None
    try:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_RDWR)
        except FileExistsError as exc:
            raise ArchivoCajaOcupadoError(
                "Otro guardado esta en curso. Vuelve a presionar Guardar en unos segundos."
            ) from exc
        except PermissionError as exc:
            raise ArchivoCajaOcupadoError(
                "No se pudo guardar porque el libro esta abierto o sincronizandose. Cierra Excel y vuelve a intentarlo."
            ) from exc
        except OSError as exc:
            raise ArchivoCajaOcupadoError(
                "No se pudo bloquear el libro para guardar. Vuelve a intentarlo en unos segundos."
            ) from exc
        yield
    finally:
        if fd is not None:
            os.close(fd)
        if lock_path.exists():
            lock_path.unlink(missing_ok=True)


def _escribir_encabezados(ws, modulo: str):
    if modulo == "bonos":
        headers = BONOS_HEADERS
    elif modulo == "contadores":
        headers = CONTADORES_HEADERS
    else:
        headers = ENCABEZADOS
    ws.append(headers)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2F5496")
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    if modulo == "bonos":
        widths = {"A": 12, "B": 12, "C": 28, "D": 14, "E": 22}
    elif modulo == "contadores":
        widths = {
            "A": 14, "B": 26, "C": 14, "D": 12, "E": 12,
            "F": 12, "G": 12, "H": 14, "I": 14, "J": 16,
            "K": 18, "L": 30, "M": 22,
        }
    else:
        widths = {"A": 14, "B": 16, "C": 22, "D": 14, "E": 10, "F": 14, "G": 14, "H": 22}
    for col, width in widths.items():
        ws.column_dimensions[col].width = width


def _hoja_tiene_datos(ws) -> bool:
    return ws.max_row > 1


def _puede_migrar_desde_registros_diarios(wb) -> bool:
    if HOJA_REGISTROS not in wb.sheetnames:
        return False

    for name in wb.sheetnames:
        if name == HOJA_REGISTROS:
            continue
        if _hoja_tiene_datos(wb[name]):
            return False
    return True


def _obtener_hojas_para_lectura(wb, modulo: str):
    return [wb[name] for name in _nombres_lectura_modulo(modulo) if name in wb.sheetnames]


def _asegurar_hoja(wb, modulo: str):
    hoja_destino = _obtener_nombre_hoja_seccion(modulo)
    if hoja_destino in wb.sheetnames:
        return wb[hoja_destino]

    if modulo == "caja":
        for legacy_name in _nombres_legacy_caja():
            if legacy_name == HOJA_REGISTROS:
                continue
            if legacy_name in wb.sheetnames:
                wb[legacy_name].title = hoja_destino
                return wb[hoja_destino]

        if _puede_migrar_desde_registros_diarios(wb):
            ws_legacy = wb[HOJA_REGISTROS]
            ws_legacy.title = hoja_destino
            return ws_legacy

    ws = wb.create_sheet(hoja_destino)
    _escribir_encabezados(ws, modulo)
    return ws


def _iterar_filas_fecha(hojas, fecha_objetivo: date):
    for ws in hojas:
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row[0] is None:
                continue
            cell_date = row[0]
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            if isinstance(cell_date, date) and cell_date == fecha_objetivo:
                yield row


def _formatear_filas_recientes(ws, cantidad_filas: int) -> None:
    if cantidad_filas <= 0:
        return

    last_row = ws.max_row
    start_row = last_row - cantidad_filas + 1
    for row_num in range(start_row, last_row + 1):
        ws.cell(row_num, 7).number_format = "#,##0"
        ws.cell(row_num, 1).number_format = "YYYY-MM-DD"
        ws.cell(row_num, 8).number_format = "YYYY-MM-DD HH:mm:SS"


def _formatear_filas_recientes_bonos(ws, cantidad_filas: int) -> None:
    if cantidad_filas <= 0:
        return
    last_row = ws.max_row
    start_row = last_row - cantidad_filas + 1
    for row_num in range(start_row, last_row + 1):
        ws.cell(row_num, 1).number_format = "DD-MM"
        ws.cell(row_num, 2).number_format = "HH:mm AM/PM"
        ws.cell(row_num, 4).number_format = "#,##0"
        ws.cell(row_num, 5).number_format = "YYYY-MM-DD HH:mm:SS"


def _formatear_filas_recientes_contadores(ws, cantidad_filas: int) -> None:
    if cantidad_filas <= 0:
        return
    last_row = ws.max_row
    start_row = last_row - cantidad_filas + 1
    for row_num in range(start_row, last_row + 1):
        ws.cell(row_num, 1).number_format = "YYYY-MM-DD"   # fecha
        ws.cell(row_num, 11).number_format = "#,##0"        # resultado_monetario
        ws.cell(row_num, 13).number_format = "YYYY-MM-DD HH:mm:SS"  # fecha_hora_registro


def fecha_existe_modulo(modulo: str, fecha: date, year: int) -> bool:
    path = get_excel_path(year)
    if not path.exists():
        return False

    wb = load_workbook(path, read_only=True)
    hojas = _obtener_hojas_para_lectura(wb, modulo)
    if not hojas:
        wb.close()
        return False

    for row in _iterar_filas_fecha(hojas, fecha):
        if _fila_es_modulo(modulo, row):
            wb.close()
            return True

    wb.close()
    return False


def guardar_filas_modulo(modulo: str, filas: list, year: int, reemplazar_fecha: date | None = None) -> None:
    path = get_excel_path(year)
    with _bloqueo_escritura(path):
        wb = _abrir_o_crear_workbook(path)
        if reemplazar_fecha is not None:
            _eliminar_fecha_modulo_en_workbook(wb, modulo, reemplazar_fecha)

        if filas:
            ws = _asegurar_hoja(wb, modulo)
            for fila in filas:
                ws.append(fila)
            if modulo == "bonos":
                _formatear_filas_recientes_bonos(ws, len(filas))
            elif modulo == "contadores":
                _formatear_filas_recientes_contadores(ws, len(filas))
            else:
                _formatear_filas_recientes(ws, len(filas))

        try:
            wb.save(path)
        except PermissionError as exc:
            raise ArchivoCajaOcupadoError(
                "No se pudo guardar porque el libro esta siendo usado por otro proceso. Intenta nuevamente."
            ) from exc
        finally:
            wb.close()


def _eliminar_fecha_modulo_en_workbook(wb, modulo: str, fecha: date) -> int:
    total_borradas = 0
    for nombre in _nombres_lectura_modulo(modulo):
        if nombre not in wb.sheetnames:
            continue
        ws = wb[nombre]
        filas_a_borrar = []
        for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if row[0] is None:
                continue
            cell_date = row[0]
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            if isinstance(cell_date, date) and cell_date == fecha and _fila_es_modulo(modulo, row):
                filas_a_borrar.append(i)

        for row_num in reversed(filas_a_borrar):
            ws.delete_rows(row_num)
        total_borradas += len(filas_a_borrar)
    return total_borradas


def eliminar_fecha_modulo(modulo: str, fecha: date, year: int) -> int:
    path = get_excel_path(year)
    if not path.exists():
        return 0

    with _bloqueo_escritura(path):
        try:
            wb = load_workbook(path)
        except PermissionError as exc:
            raise ArchivoCajaOcupadoError(
                "No se pudo actualizar el libro porque esta ocupado. Intenta nuevamente."
            ) from exc

        total_borradas = _eliminar_fecha_modulo_en_workbook(wb, modulo, fecha)
        try:
            wb.save(path)
        except PermissionError as exc:
            raise ArchivoCajaOcupadoError(
                "No se pudo actualizar el libro porque esta ocupado. Intenta nuevamente."
            ) from exc
        finally:
            wb.close()
        return total_borradas


def obtener_fechas_modulo_año(modulo: str, year: int) -> list[str]:
    path = get_excel_path(year)
    if not path.exists():
        return []

    wb = load_workbook(path, read_only=True)
    hojas = _obtener_hojas_para_lectura(wb, modulo)
    if not hojas:
        wb.close()
        return []

    fechas = set()
    for ws in hojas:
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row[0] is None:
                continue
            cell_date = row[0]
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            if isinstance(cell_date, date) and cell_date.year == year and _fila_es_modulo(modulo, row):
                fechas.add(str(cell_date))

    wb.close()
    return sorted(fechas)


def obtener_datos_caja_fecha(fecha: date, year: int) -> dict | None:
    path = get_excel_path(year)
    if not path.exists():
        return None

    wb = load_workbook(path, read_only=True)
    hojas = _obtener_hojas_para_lectura(wb, "caja")
    if not hojas:
        wb.close()
        return None

    resultado = {
        "billetes": {},
        "total_monedas": 0,
        "billetes_viejos": 0,
        "venta_practisistemas": 0,
        "venta_deportivas": 0,
    }
    found = False

    for row in _iterar_filas_fecha(hojas, fecha):
        if not _fila_es_modulo("caja", row):
            continue
        found = True
        tipo, concepto, subtotal = row[1], row[2], row[6] or 0
        if tipo == "billete":
            denom, cantidad = row[3], row[4]
            if denom is not None:
                resultado["billetes"][str(int(denom))] = int(cantidad or 0)
        elif tipo == "manual":
            if concepto == "Total monedas":
                resultado["total_monedas"] = subtotal
            elif concepto == "Billetes viejos":
                resultado["billetes_viejos"] = subtotal
        elif tipo == "informativo":
            if concepto == "Venta Practisistemas":
                resultado["venta_practisistemas"] = subtotal
            elif concepto == "Venta Deportivas":
                resultado["venta_deportivas"] = subtotal

    wb.close()
    return resultado if found else None


def obtener_items_modulo_fecha(modulo: str, fecha: date, year: int) -> dict | None:
    if modulo == "bonos":
        registros = obtener_bonos_fecha(fecha, year)
        if not registros:
            return None
        return {
            "items": [{"concepto": item["cliente"], "valor": item["valor"]} for item in registros],
            "total": sum(item["valor"] for item in registros),
        }

    path = get_excel_path(year)
    if not path.exists():
        return None

    wb = load_workbook(path, read_only=True)
    hojas = _obtener_hojas_para_lectura(wb, modulo)
    if not hojas:
        wb.close()
        return None

    items = []
    total = 0
    for row in _iterar_filas_fecha(hojas, fecha):
        if not _fila_es_modulo(modulo, row):
            continue
        concepto = row[2] or ""
        valor = row[6] or 0
        items.append({"concepto": concepto, "valor": valor})
        total += valor

    wb.close()
    if not items:
        return None
    return {"items": items, "total": total}


def obtener_ultima_fecha_modulo(modulo: str, year: int):
    path = get_excel_path(year)
    if not path.exists():
        return None

    wb = load_workbook(path, read_only=True)
    hojas = _obtener_hojas_para_lectura(wb, modulo)
    if not hojas:
        wb.close()
        return None

    ultima = None
    for ws in hojas:
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row[0] is None:
                continue
            if modulo != "bonos" and not _fila_es_modulo(modulo, row):
                continue
            cell_date = row[0]
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            if not isinstance(cell_date, date):
                continue
            if ultima is None or cell_date > ultima:
                ultima = cell_date

    wb.close()
    return ultima

def guardar_bono_registro(fecha: date, cliente: str, valor: float, timestamp: datetime) -> float:
    fila = [fecha, timestamp, cliente, valor, timestamp]
    path = get_excel_path(fecha.year)
    with _bloqueo_escritura(path):
        wb = _abrir_o_crear_workbook(path)
        ws = _asegurar_hoja(wb, "bonos")
        total_dia = 0.0
        for row in ws.iter_rows(min_row=2, values_only=True):
            cell_date = row[0]
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            if isinstance(cell_date, date) and cell_date == fecha:
                total_dia += float(row[3] or 0)

        ws.append(fila)
        _formatear_filas_recientes_bonos(ws, 1)
        try:
            wb.save(path)
        except PermissionError as exc:
            raise ArchivoCajaOcupadoError(
                "No se pudo guardar porque el libro esta siendo usado por otro proceso. Intenta nuevamente."
            ) from exc
        finally:
            wb.close()
    return total_dia + float(valor or 0)


def obtener_bonos_fecha(fecha: date, year: int) -> list[dict]:
    path = get_excel_path(year)
    if not path.exists():
        return []

    wb = load_workbook(path, read_only=True)
    hojas = _obtener_hojas_para_lectura(wb, "bonos")
    if not hojas:
        wb.close()
        return []

    registros = []
    for ws in hojas:
        for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if row[0] is None:
                continue
            cell_date = row[0]
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            if not (isinstance(cell_date, date) and cell_date == fecha):
                continue
            hora = row[1]
            if isinstance(hora, datetime):
                hora_texto = hora.strftime("%I:%M %p")
            else:
                hora_texto = str(hora or "")
            valor = float(row[3] or 0)
            registros.append({
                "sheet_row": idx,
                "fecha": cell_date.isoformat(),
                "fecha_display": cell_date.strftime("%d-%m"),
                "hora_display": hora_texto,
                "cliente": str(row[2] or ""),
                "valor": valor,
                "fecha_hora_registro": row[4].isoformat() if isinstance(row[4], datetime) else str(row[4] or ""),
            })
    wb.close()
    registros.sort(key=lambda item: item["fecha_hora_registro"] or "")
    return registros


def obtener_ultimo_bono(fecha: date, year: int) -> dict | None:
    registros = obtener_bonos_fecha(fecha, year)
    return registros[-1] if registros else None


def actualizar_ultimo_bono(fecha: date, year: int, cliente: str, valor: float, timestamp: datetime) -> dict | None:
    path = get_excel_path(year)
    if not path.exists():
        return None

    with _bloqueo_escritura(path):
        wb = _abrir_o_crear_workbook(path)
        ws = _asegurar_hoja(wb, "bonos")
        ultimo_row = None
        ultimo_ts = None
        for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=False), start=2):
            cell_date = row[0].value
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            if not (isinstance(cell_date, date) and cell_date == fecha):
                continue
            ts = row[4].value
            if isinstance(ts, datetime) and (ultimo_ts is None or ts >= ultimo_ts):
                ultimo_ts = ts
                ultimo_row = idx
        if ultimo_row is None:
            wb.close()
            return None
        valor_anterior = float(ws.cell(ultimo_row, 4).value or 0)
        ws.cell(ultimo_row, 3).value = cliente
        ws.cell(ultimo_row, 4).value = valor
        ws.cell(ultimo_row, 5).value = timestamp
        _formatear_filas_recientes_bonos(ws, 1)
        total_dia = 0.0
        for row in ws.iter_rows(min_row=2, values_only=True):
            cell_date = row[0]
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            if isinstance(cell_date, date) and cell_date == fecha:
                total_dia += float(row[3] or 0)
        wb.save(path)
        wb.close()
    return {
        "hora_display": timestamp.strftime("%I:%M %p"),
        "cliente": cliente,
        "valor": float(valor),
        "valor_anterior": valor_anterior,
        "total_dia": total_dia,
    }


def eliminar_ultimo_bono(fecha: date, year: int) -> float | None:
    path = get_excel_path(year)
    if not path.exists():
        return None

    with _bloqueo_escritura(path):
        wb = _abrir_o_crear_workbook(path)
        ws = _asegurar_hoja(wb, "bonos")
        ultimo_row = None
        ultimo_ts = None
        for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=False), start=2):
            cell_date = row[0].value
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            if not (isinstance(cell_date, date) and cell_date == fecha):
                continue
            ts = row[4].value
            if isinstance(ts, datetime) and (ultimo_ts is None or ts >= ultimo_ts):
                ultimo_ts = ts
                ultimo_row = idx
        if ultimo_row is None:
            wb.close()
            return None
        ws.delete_rows(ultimo_row)
        total_dia = 0.0
        for row in ws.iter_rows(min_row=2, values_only=True):
            cell_date = row[0]
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            if isinstance(cell_date, date) and cell_date == fecha:
                total_dia += float(row[3] or 0)
        wb.save(path)
        wb.close()
        return total_dia
