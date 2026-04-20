from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.runtime_paths import get_web_dir
from app.routers import modules, recaudo as recaudo_router, settings as settings_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services import backup_service, settings_service
    if settings_service.is_super_admin_build():
        backup_service.programar_backup()
    yield


app = FastAPI(title="ContabilidadJDW", lifespan=lifespan)

WEB_DIR = get_web_dir()
app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")


class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path == "/" or request.url.path.startswith("/static/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app.add_middleware(NoCacheMiddleware)

app.include_router(modules.router)
app.include_router(settings_router.router)
app.include_router(recaudo_router.router)


@app.get("/")
def root():
    return FileResponse(
        str(WEB_DIR / "index.html"),
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )
