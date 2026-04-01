from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from datetime import date

from app.models.caja_models import CajaEntrada, CajaRespuesta
from app.services import caja_service, excel_service
from app.services import settings_service

app = FastAPI(title="Caja Diaria")

WEB_DIR = Path(__file__).parent.parent / "web"
app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")


@app.get("/")
def root():
    return FileResponse(str(WEB_DIR / "index.html"))


@app.post("/api/caja/guardar", response_model=CajaRespuesta)
def guardar(entrada: CajaEntrada):
    resultado = caja_service.guardar_caja(entrada)
    return CajaRespuesta(**resultado)


@app.get("/api/caja/fechas/{year}")
def fechas_año(year: int):
    return {"fechas": excel_service.obtener_fechas_año(year)}


@app.get("/api/caja/fecha/{fecha}/datos")
def datos_fecha(fecha: str):
    try:
        d = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
    datos = excel_service.obtener_datos_fecha(d, d.year)
    if datos is None:
        raise HTTPException(status_code=404, detail="No hay datos para esa fecha")
    return datos


@app.get("/api/caja/fecha/{fecha}")
def consultar_fecha(fecha: str):
    try:
        return caja_service.consultar_fecha(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")


@app.get("/api/caja/ultima")
def ultima():
    year = date.today().year
    ultima_fecha = excel_service.obtener_ultima_fecha(year)
    if ultima_fecha is None:
        return {"fecha": None, "mensaje": "Sin registros este año"}
    return {"fecha": str(ultima_fecha)}


@app.get("/api/settings")
def get_settings():
    return settings_service.get_settings()


@app.post("/api/settings")
def post_settings(body: dict):
    settings_service.save_settings(body)
    return {"ok": True}
