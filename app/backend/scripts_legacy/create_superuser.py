import sys
import os

# Create absolute path strictly assuming we run it from backend
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import SessionLocal
from models.all_models import Usuario
from core.security import get_password_hash

def main():
    db = SessionLocal()
    try:
        user = db.query(Usuario).filter(Usuario.username == "SuperUser").first()
        if user:
            print("SuperUser ya existe.")
            return

        new_user = Usuario(
            username="SuperUser",
            email="superadmin@portal.com",
            nombre="Super Administrador",
            hashed_password=get_password_hash("123"),
            es_admin=True,
            mod_legal=True,
            mod_materialidad=True,
            mod_dashboard=True,
            activo=True
        )
        db.add(new_user)
        db.commit()
        print("SuperUser creado correctamente.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
