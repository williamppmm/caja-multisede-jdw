import os
from contextlib import contextmanager
from pathlib import Path
from datetime import date, datetime

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

from app.config import ENCABEZADOS, HOJA_REGISTROS, get_excel_path
from app.services.settings_service import get_settings


class ArchivoCajaOcupadoError(Exception):
    pass


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


def _obtener_nombre_hoja() -> str:
    return _normalizar_nombre_hoja(get_settings().get("sede"))


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
        yield
    finally:
        if fd is not None:
            os.close(fd)
        if lock_path.exists():
            lock_path.unlink(missing_ok=True)


def _escribir_encabezados(ws):
    ws.append(ENCABEZADOS)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2F5496")
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    widths = {
        "A": 14,
        "B": 16,
        "C": 22,
        "D": 14,
        "E": 10,
        "F": 14,
        "G": 14,
        "H": 22,
    }
    for col, width in widths.items():
        ws.column_dimensions[col].width = width


def _hoja_tiene_datos(ws) -> bool:
    return ws.max_row > 1


def _puede_migrar_desde_legacy(wb) -> bool:
    if HOJA_REGISTROS not in wb.sheetnames:
        return False

    for name in wb.sheetnames:
        if name == HOJA_REGISTROS:
            continue
        if _hoja_tiene_datos(wb[name]):
            return False
    return True


def _obtener_hoja_para_lectura(wb):
    hoja_destino = _obtener_nombre_hoja()
    if hoja_destino in wb.sheetnames:
        return wb[hoja_destino]

    if _puede_migrar_desde_legacy(wb):
        return wb[HOJA_REGISTROS]

    return None


def _asegurar_hoja(wb):
    hoja_destino = _obtener_nombre_hoja()
    if hoja_destino in wb.sheetnames:
        return wb[hoja_destino]

    if _puede_migrar_desde_legacy(wb):
        ws_legacy = wb[HOJA_REGISTROS]
        ws_legacy.title = hoja_destino
        return ws_legacy

    ws = wb.create_sheet(hoja_destino)
    _escribir_encabezados(ws)
    return ws


def fecha_existe(fecha: date, year: int) -> bool:
    path = get_excel_path(year)
    if not path.exists():
        return False

    wb = load_workbook(path, read_only=True)
    ws = _obtener_hoja_para_lectura(wb)
    if ws is None:
        wb.close()
        return False

    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None:
            continue
        cell_date = row[0]
        if isinstance(cell_date, datetime):
            cell_date = cell_date.date()
        if isinstance(cell_date, date) and cell_date == fecha:
            wb.close()
            return True

    wb.close()
    return False


def guardar_filas(filas: list, year: int) -> None:
    path = get_excel_path(year)
    with _bloqueo_escritura(path):
        wb = _abrir_o_crear_workbook(path)
        ws = _asegurar_hoja(wb)

        for fila in filas:
            ws.append(fila)

        last_row = ws.max_row
        start_row = last_row - len(filas) + 1
        for row_num in range(start_row, last_row + 1):
            ws.cell(row_num, 7).number_format = "#,##0"
            ws.cell(row_num, 1).number_format = "YYYY-MM-DD"
            ws.cell(row_num, 8).number_format = "YYYY-MM-DD HH:MM:SS"

        try:
            wb.save(path)
        except PermissionError as exc:
            raise ArchivoCajaOcupadoError(
                "No se pudo guardar porque el libro esta siendo usado por otro proceso. Intenta nuevamente."
            ) from exc
        finally:
            wb.close()


def eliminar_fecha(fecha: date, year: int) -> int:
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
        ws = _obtener_hoja_para_lectura(wb)
        if ws is None:
            wb.close()
            return 0

        filas_a_borrar = []
        for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if row[0] is None:
                continue
            cell_date = row[0]
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            if isinstance(cell_date, date) and cell_date == fecha:
                filas_a_borrar.append(i)

        for row_num in reversed(filas_a_borrar):
            ws.delete_rows(row_num)

        try:
            wb.save(path)
        except PermissionError as exc:
            raise ArchivoCajaOcupadoError(
                "No se pudo actualizar el libro porque esta ocupado. Intenta nuevamente."
            ) from exc
        finally:
            wb.close()
        return len(filas_a_borrar)


def obtener_fechas_año(year: int) -> list:
    path = get_excel_path(year)
    if not path.exists():
        return []

    wb = load_workbook(path, read_only=True)
    ws = _obtener_hoja_para_lectura(wb)
    if ws is None:
        wb.close()
        return []

    fechas = set()
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None:
            continue
        cell_date = row[0]
        if isinstance(cell_date, datetime):
            cell_date = cell_date.date()
        if isinstance(cell_date, date) and cell_date.year == year:
            fechas.add(str(cell_date))

    wb.close()
    return sorted(fechas)


def obtener_datos_fecha(fecha: date, year: int) -> dict | None:
    path = get_excel_path(year)
    if not path.exists():
        return None

    wb = load_workbook(path, read_only=True)
    ws = _obtener_hoja_para_lectura(wb)
    if ws is None:
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

    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None:
            continue
        cell_date = row[0]
        if isinstance(cell_date, datetime):
            cell_date = cell_date.date()
        if not (isinstance(cell_date, date) and cell_date == fecha):
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


def obtener_ultima_fecha(year: int):
    path = get_excel_path(year)
    if not path.exists():
        return None

    wb = load_workbook(path, read_only=True)
    ws = _obtener_hoja_para_lectura(wb)
    if ws is None:
        wb.close()
        return None

    ultima = None
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is not None:
            cell_date = row[0]
            if isinstance(cell_date, datetime):
                cell_date = cell_date.date()
            ultima = cell_date

    wb.close()
    return ultima
