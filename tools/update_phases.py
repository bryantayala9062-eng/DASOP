import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(BASE_DIR, 'app', 'backend'))

from sqlalchemy.orm import Session
from app.backend.core.database import SessionLocal
from app.backend.models.all_models import Contrato

def migrate_phases():
    db = SessionLocal()
    contratos = db.query(Contrato).all()
    
    stage_map = {
        "1_REDACCION_LEGAL": "hecho",
        "2_TRANSITO_A_CLIENTE": "jc_carlos",
        "3_EN_PODER_CLIENTE": "cliente",
        "4_RECOLECCION_CLIENTE": "recolector",
        "5_TRANSITO_A_NOTARIA": "firmas",
        "6_EN_NOTARIA": "notaria",
        "7_RETORNO_A_OFICINA": "optimal",
        "8_FINALIZADO": "optimal",
        # Por si quedaron de la versión anterior de la base de datos:
        "2_REVISION_GERENCIA": "jc_carlos",
        "3_REVISION_CLIENTE": "cliente",
        "4_RECOLECCION_FIRMAS": "firmas",
        "5_NOTARIA": "notaria",
        "6_ENTREGA_FISICA": "recolector",
        "7_RESGUARDO": "optimal",
    }
    
    updated = 0
    for c in contratos:
        if c.estatus in stage_map:
            c.estatus = stage_map[c.estatus]
            updated += 1
            
    db.commit()
    print(f"Fases actualizadas en {updated} contratos de DashOP.")
    db.close()

if __name__ == "__main__":
    migrate_phases()
