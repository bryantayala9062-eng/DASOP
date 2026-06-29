from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime
import os
import logging
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv

# Configuración de Logs
log_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log_handler = RotatingFileHandler('complianceop.log', maxBytes=5*1024*1024, backupCount=2)
log_handler.setFormatter(log_formatter)

logger = logging.getLogger("complianceop")
logger.setLevel(logging.INFO)
logger.addHandler(log_handler)
logger.addHandler(logging.StreamHandler()) # Para verlos en consola

load_dotenv()

from api.auth import router as auth_router
from api.users import router as users_router
from api.dashboard import router as dashboard_router
from api.evidences import router as evidences_router
from api.department_reports import router as department_reports_router
from api.kpis import router as kpis_router

from core.database import engine, SessionLocal, Base

# Create tables if missing (safe on startup)
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[SYSTEM] Application started (Zero-Ghost modules)")
    yield
    logger.info("[SYSTEM] Application stopped")


app = FastAPI(title="Compliance Op API", version="2.0.0", lifespan=lifespan)

from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
from fastapi.responses import JSONResponse

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request, exc: SQLAlchemyError):
    logger.error(f"Error de Base de Datos: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Ocurrió un error interno en la base de datos."},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    logger.warning(f"Error de validación: {exc}")
    return JSONResponse(
        status_code=422,
        content={"detail": "Datos de entrada inválidos.", "errors": exc.errors()},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://127.0.0.1", "http://localhost:8000", "https://compliance.op-dash.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(dashboard_router)
app.include_router(evidences_router)
app.include_router(department_reports_router)
app.include_router(kpis_router)


# --- Servir frontend construido (dist) ---
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")


def _serve_index_from(path_dir: str):
    index_path = os.path.join(path_dir, "index.html")
    try:
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(
                f.read(),
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            )
    except FileNotFoundError:
        return HTMLResponse("Frontend build not found", status_code=500)


if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/", response_class=HTMLResponse)
    async def serve_index_root() -> HTMLResponse:
        return _serve_index_from(FRONTEND_DIST)

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):  # type: ignore[unused-argument]
        """Catch-all para rutas del SPA; deja libres /api/* y /docs.
        Si la ruta corresponde a un archivo estático en el build, lo sirve.
        """
        if full_path.startswith("api/") or full_path.startswith("docs"):
            return HTMLResponse("Not Found", status_code=404)

        # Si piden un archivo existente en el build (css, js, assets...), devolverlo
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)

        return _serve_index_from(FRONTEND_DIST)
else:
    # Fallback to serve the unbuilt frontend folder (useful during development)
    if os.path.isdir(FRONTEND_DIR):
        assets_dir = os.path.join(FRONTEND_DIR, "assets")
        if os.path.isdir(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/", response_class=HTMLResponse)
        async def serve_index_root_dev() -> HTMLResponse:
            return _serve_index_from(FRONTEND_DIR)

        @app.get("/{full_path:path}")
        async def serve_spa_dev(full_path: str):  # type: ignore[unused-argument]
            if full_path.startswith("api/") or full_path.startswith("docs"):
                return HTMLResponse("Not Found", status_code=404)

            # Si piden un archivo estático existente en frontend/, devolverlo (style.css, app.js...)
            candidate = os.path.join(FRONTEND_DIR, full_path)
            if os.path.isfile(candidate):
                return FileResponse(candidate)

            return _serve_index_from(FRONTEND_DIR)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}
