import os
import sys

# Agregar las rutas necesarias al sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(BASE_DIR, 'app', 'backend'))

from sqlalchemy.orm import Session
from app.backend.core.database import SessionLocal
from app.backend.models.all_models import Contrato, DocumentoMaterialidad
from app.backend.integrations.compliance_sync import sync_contract, sync_evidence

def sync_all_existing():
    print("Iniciando sincronización masiva de DashOP a ComplianceOP...")
    db = SessionLocal()
    
    # 1. Sincronizar todos los contratos
    contratos = db.query(Contrato).all()
    print(f"Encontrados {len(contratos)} contratos para sincronizar.")
    
    sync_count = 0
    for c in contratos:
        try:
            sync_contract(c.id, c.cliente, c.concepto, c.estatus, c.responsable_interno)
            sync_count += 1
            if sync_count % 50 == 0:
                print(f"Sincronizados {sync_count}/{len(contratos)} contratos...")
        except Exception as e:
            print(f"Error sincronizando contrato {c.id}: {e}")
            
    # 2. Sincronizar todas las evidencias (PDFs subidos a contratos)
    print("Sincronizando evidencias (archivos propios de los contratos)...")
    evidencias_count = 0
    for c in contratos:
        if c.archivo_path:
            filename = os.path.basename(c.archivo_path)
            try:
                sync_evidence(c.id, c.archivo_path, filename)
                evidencias_count += 1
            except Exception as e:
                print(f"Error sincronizando evidencia del contrato {c.id}: {e}")
                
    # 3. Sincronizar PDFs desde Materialidad vinculados a contratos
    print("Sincronizando evidencias desde Materialidad vinculadas a contratos...")
    docs_mat = db.query(DocumentoMaterialidad).filter(DocumentoMaterialidad.contrato_id != None).all()
    mat_count = 0
    for d in docs_mat:
        if d.ruta_fisica:
            filename = os.path.basename(d.ruta_fisica)
            try:
                # La ruta de materialidad es relativa al root de backend
                full_path = os.path.join(BASE_DIR, 'app', 'backend', d.ruta_fisica)
                sync_evidence(d.contrato_id, full_path, filename)
                mat_count += 1
            except Exception as e:
                print(f"Error sincronizando evidencia mat {d.id}: {e}")

    print(f"Sincronización completada!")
    print(f"Contratos: {sync_count}")
    print(f"Evidencias directas: {evidencias_count}")
    print(f"Evidencias desde Materialidad: {mat_count}")
    db.close()

if __name__ == "__main__":
    sync_all_existing()
