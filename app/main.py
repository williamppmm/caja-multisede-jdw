from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.runtime_paths import get_web_dir
from app.routers import modules, settings as settings_router

app = FastAPI(title="Caja Diaria")

WEB_DIR = get_web_dir()
app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")

app.include_router(modules.router)
app.include_router(settings_router.router)


@app.get("/")
def root():
    return FileResponse(str(WEB_DIR / "index.html"))
