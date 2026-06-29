import os
from pathlib import Path
from sqlalchemy.orm import Session
from datetime import datetime

import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import SessionLocal
from models.all_models import DocumentoMaterialidad

BASE_DIR = Path(__file__).resolve().parent

def limpiar_duplicados():
    db = SessionLocal()
    
    # Obtener todas las opiniones de cumplimiento y CSFs que tengan periodo
    docs = db.query(DocumentoMaterialidad).filter(
        DocumentoMaterialidad.tipo_documento.in_(["OPINION_CUMPLIMIENTO", "CONSTANCIA_SITUACION"])
    ).order_by(DocumentoMaterialidad.fecha_subida.desc()).all()
    
    # Agrupar por (empresa_id, tipo_documento, periodo)
    vistos = set()
    eliminados = 0
    
    for doc in docs:
        key = (doc.empresa_id, doc.tipo_documento, doc.periodo)
        
        if key in vistos:
            # Es un duplicado (y como están ordenados desc, este es el más antiguo)
            print(f"Eliminando duplicado: {doc.tipo_documento} - {doc.periodo} (ID: {doc.id})")
            
            # Borrar archivo físico
            ruta_vieja = BASE_DIR / doc.ruta_fisica
            if ruta_vieja.exists():
                try:
                    ruta_vieja.unlink()
                except Exception as e:
                    print(f"  Error borrando archivo: {e}")
            
            db.delete(doc)
            eliminados += 1
        else:
            # Es el primero que vemos (el más reciente), lo guardamos en vistos
            vistos.add(key)
            
    db.commit()
    db.close()
    
    print(f"\nProceso completado. Se eliminaron {eliminados} documentos duplicados antiguos.")

if __name__ == "__main__":
    print("Iniciando limpieza de documentos duplicados...")
    limpiar_duplicados()
