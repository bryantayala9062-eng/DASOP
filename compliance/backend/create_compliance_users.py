import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import SessionLocal
from models.all_models import User
from core.security import get_password_hash

users_to_add = [
    {"full_name": "Katia Gonzalez", "username": "katia", "department": "Administración", "role": "user", "password": "1234"},
    {"full_name": "Fernando Galaviz", "username": "fernando", "department": "Contabilidad", "role": "user", "password": "1234"},
    {"full_name": "Andrea Figueroa", "username": "andrea", "department": "Tesorería", "role": "user", "password": "1234"},
    {"full_name": "Eduardo Lopez", "username": "eduardo", "department": "Operaciones", "role": "user", "password": "1234"},
    {"full_name": "Jaime Plata", "username": "jaime", "department": "Legal", "role": "user", "password": "1234"},
    {"full_name": "Alejandra", "username": "alejandra", "department": "RH", "role": "user", "password": "1234"},
]

def main():
    db = SessionLocal()
    try:
        for u in users_to_add:
            existing = db.query(User).filter(User.username == u["username"]).first()
            if existing:
                print(f"User {u['username']} already exists. Skipping.")
                continue
            
            new_user = User(
                username=u["username"],
                full_name=u["full_name"],
                department=u["department"],
                role=u["role"],
                hashed_password=get_password_hash(u["password"])
            )
            db.add(new_user)
            print(f"Added {u['username']} - {u['department']}")
        
        db.commit()
        print("All users created successfully.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
