import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(BASE_DIR, 'compliance', 'backend'))

from sqlalchemy.orm import Session
from compliance.backend.core.database import SessionLocal
from compliance.backend.models.all_models import Task

def clean_contract_tasks():
    db = SessionLocal()
    tasks_to_delete = db.query(Task).filter(Task.code.like("TASK-CONT-%")).all()
    print(f"Borrando {len(tasks_to_delete)} tareas...")
    for t in tasks_to_delete:
        db.delete(t)
    db.commit()
    print("¡Tareas borradas exitosamente!")
    db.close()

if __name__ == "__main__":
    clean_contract_tasks()
