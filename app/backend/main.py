from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

from api.auth import router as auth_router
from api.materialidad.router import router as materialidad_router
from api.legal.router import router as legal_router
from api.dashboard.router import router as dashboard_router
from api.legal import email_utils
from core.database import SessionLocal
from models.all_models import Contrato

# --- STATUS LIMITS (dias max por estatus antes de alertar) ---
STATUS_LIMITS = {
    "1_REDACCION_LEGAL": 2,
    "2_TRANSITO_A_CLIENTE": 4,
    "3_EN_PODER_CLIENTE": 2,
    "4_RECOLECCION_CLIENTE": 1,
    "5_TRANSITO_A_NOTARIA": 2,
    "6_EN_NOTARIA": 2,
    "7_RETORNO_A_OFICINA": 1
}

# --- SCHEDULER (TAREAS PROGRAMADAS) ---
scheduler = AsyncIOScheduler()

async def check_delays():
    """Tarea automatica: Busca contratos estancados y envia alertas por correo."""
    print("[CRON] Iniciando revision diaria de contratos...")
    db = SessionLocal()
    try:
        contracts = db.query(Contrato).filter(Contrato.estatus != "8_FINALIZADO").all()
        now = datetime.utcnow()
        alertas_enviadas = 0
        for c in contracts:
            if not c.fecha_actualizacion:
                continue
            days = (now - c.fecha_actualizacion).days
            limit = STATUS_LIMITS.get(c.estatus)
            if limit and days > limit:
                await email_utils.send_alert_email(
                    c.email_responsable, c.id, c.cliente, c.estatus, days
                )
                alertas_enviadas += 1
        print(f"[CRON] Revision finalizada. {alertas_enviadas} alertas enviadas.")
    except Exception as e:
        print(f"[CRON] Error en revision: {e}")
    finally:
        db.close()



# --- LIFECYCLE ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Arrancar scheduler de alertas cada 24h
    scheduler.add_job(check_delays, 'interval', hours=24, id='check_delays')
    scheduler.start()
    print("[SYSTEM] Scheduler de alertas iniciado (revision cada 24h)")
    yield
    scheduler.shutdown()
    print("[SYSTEM] Scheduler detenido")


# --- APP CONFIG ---
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5190")

app = FastAPI(title="PORTAL ERP CORPORATIVO API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(materialidad_router)
app.include_router(legal_router)
app.include_router(dashboard_router)

@app.get("/")
def root():
    return {"message": "Portal ERP Backend Online"}
