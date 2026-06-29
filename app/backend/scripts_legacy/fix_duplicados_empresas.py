"""
Script para corregir empresas duplicadas en Materialidad.
Migra los documentos de las empresas fantasma a las empresas reales
y luego elimina las empresas fantasma.
"""
import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import SessionLocal
from models.all_models import Empresa, DocumentoMaterialidad, Contrato

# Mapeo: empresa_fantasma_id -> empresa_real_id
MERGE_MAP = {
    89: 11,   # DESARROLLO HUMANO ASPAC -> DESARROLLO HUMANO ASPACT
    90: 12,   # EMPIERE GROUP INCORPORATE -> EMPIRE GROUP INCORPORATE
    91: 21,   # INGENIERIA Y CONSTRUCCIÓN HERDEL -> INGENIERIA Y CONSTRUCCION HERDEL
}

def fix():
    db = SessionLocal()
    
    for fantasma_id, real_id in MERGE_MAP.items():
        fantasma = db.query(Empresa).filter(Empresa.id == fantasma_id).first()
        real = db.query(Empresa).filter(Empresa.id == real_id).first()
        
        if not fantasma:
            print(f"  [SKIP] Empresa fantasma ID={fantasma_id} ya no existe")
            continue
        if not real:
            print(f"  [ERROR] Empresa real ID={real_id} no encontrada!")
            continue
            
        print(f"\n{'='*60}")
        print(f"  Fusionando: '{fantasma.razon_social}' (ID={fantasma_id}, RFC={fantasma.rfc})")
        print(f"  -> hacia:   '{real.razon_social}' (ID={real_id}, RFC={real.rfc})")
        
        # 1. Migrar documentos de materialidad
        docs = db.query(DocumentoMaterialidad).filter(
            DocumentoMaterialidad.empresa_id == fantasma_id
        ).all()
        
        for doc in docs:
            # Verificar si ya existe un doc del mismo tipo en la empresa real
            existing = db.query(DocumentoMaterialidad).filter(
                DocumentoMaterialidad.empresa_id == real_id,
                DocumentoMaterialidad.tipo_documento == doc.tipo_documento,
            ).first()
            
            if existing:
                print(f"  [SKIP DOC] Ya existe {doc.tipo_documento} en empresa real (doc ID={existing.id})")
                # Si el fantasma tiene resultado_op y el real no, actualizar
                if doc.resultado_op and not existing.resultado_op:
                    existing.resultado_op = doc.resultado_op
                    print(f"    -> Actualizado resultado_op = {doc.resultado_op}")
            else:
                doc.empresa_id = real_id
                print(f"  [MIGRADO] Doc ID={doc.id} tipo={doc.tipo_documento} -> empresa real")
        
        # 2. Migrar contratos vinculados
        contratos = db.query(Contrato).filter(Contrato.empresa_id == fantasma_id).all()
        for c in contratos:
            c.empresa_id = real_id
            print(f"  [MIGRADO] Contrato ID={c.id} -> empresa real")
        
        # 3. Eliminar docs que no se migraron (duplicados que ya existían)
        remaining_docs = db.query(DocumentoMaterialidad).filter(
            DocumentoMaterialidad.empresa_id == fantasma_id
        ).all()
        for doc in remaining_docs:
            print(f"  [ELIMINANDO DOC] Doc ID={doc.id} tipo={doc.tipo_documento} (ya existe en empresa real)")
            db.delete(doc)
        
        # 4. Eliminar empresa fantasma
        db.delete(fantasma)
        print(f"  [ELIMINADA] Empresa fantasma ID={fantasma_id}")
    
    db.commit()
    db.close()
    print(f"\n{'='*60}")
    print("Proceso completado exitosamente.")

if __name__ == '__main__':
    fix()
