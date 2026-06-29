from sqlalchemy.orm import Session
from models.all_models import Base, Usuario
from core.database import engine, SessionLocal
from passlib.context import CryptContext
from datetime import datetime

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def init_db():
    """Crea todas las tablas en la base de datos PostgreSQL."""
    print("[INIT] Creando tablas en PostgreSQL...")
    Base.metadata.create_all(bind=engine)
    print("[INIT] Tablas creadas con exito.")

def seed_super_admin():
    """Crea el usuario administrador maestro si no existe."""
    db = SessionLocal()
    try:
        admin_exists = db.query(Usuario).filter(Usuario.username == "admin").first()
        if not admin_exists:
            hashed_pw = pwd_context.hash("1234")
            super_admin = Usuario(
                username="admin",
                email="admin@erp.local",
                nombre="Super Administrador",
                hashed_password=hashed_pw,
                activo=True,
                es_admin=True,
                mod_legal=True,
                mod_materialidad=True,
                mod_dashboard=True
            )
            db.add(super_admin)
            db.commit()
            print("[AUTH] Super Administrador creado (User: admin | Pass: 1234)")
        else:
            print("[AUTH] Administrador ya existe. Omitiendo creacion.")
    except Exception as e:
        print(f"[ERROR] al crear admin: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
    seed_super_admin()