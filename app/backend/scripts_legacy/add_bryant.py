import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import SessionLocal
from models.all_models import Usuario
from core.security import get_password_hash

def main():
    db = SessionLocal()
    try:
        user = db.query(Usuario).filter(Usuario.username == "bryant").first()
        if user:
            print("Usuario bryant ya existe.")
            return

        new_user = Usuario(
            username="bryant",
            email="bryant@portal.com",
            nombre="Bryant",
            hashed_password=get_password_hash("1234"),
            es_admin=True,
            mod_legal=True,
            mod_materialidad=True,
            mod_dashboard=True,
            activo=True
        )
        db.add(new_user)
        db.commit()
        print("Usuario bryant creado correctamente con password '1234'.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
