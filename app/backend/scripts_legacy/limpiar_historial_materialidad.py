"""
limpiar_historial_materialidad.py
─────────────────────────────────
Script para eliminar documentos duplicados en el historial de Materialidad.
Para cada empresa y tipo de documento, mantiene solo el más reciente
(basado en fecha_subida) y elimina los anteriores tanto de la base
de datos como del sistema de archivos.

Ejecutar desde la carpeta backend/:
    python limpiar_historial_materialidad.py
"""
import sys
import os
from pathlib import Path
from sqlalchemy import func

sys.path.insert(0, str(Path(__file__).parent))

from core.database import SessionLocal
from models.all_models import DocumentoMaterialidad

BASE_DIR = Path(__file__).resolve().parent

def main():
    db = SessionLocal()
    try:
        # Obtener todos los documentos ordenados por fecha_subida descendente
        documentos = db.query(DocumentoMaterialidad).order_by(DocumentoMaterialidad.fecha_subida.desc()).all()
        
        if not documentos:
            print("No hay documentos en la base de datos.")
            return

        vistos = set() # (empresa_id, tipo_documento)
        a_eliminar = []
        a_mantener = []

        for doc in documentos:
            clave = (doc.empresa_id, doc.tipo_documento)
            if clave not in vistos:
                vistos.add(clave)
                a_mantener.append(doc)
            else:
                a_eliminar.append(doc)

        print(f"Total de documentos: {len(documentos)}")
        print(f"Documentos a mantener (más recientes): {len(a_mantener)}")
        print(f"Documentos a eliminar (duplicados): {len(a_eliminar)}")

        if not a_eliminar:
            print("✅ No hay duplicados para limpiar.")
            return

        archivos_borrados = 0
        db_borrados = 0

        for doc in a_eliminar:
            # Borrar archivo físico si existe
            ruta = BASE_DIR / doc.ruta_fisica
            if ruta.exists():
                try:
                    ruta.unlink()
                    archivos_borrados += 1
                except Exception as e:
                    print(f"  ⚠️ Error al borrar archivo {ruta}: {e}")
            
            # Borrar de BD
            db.delete(doc)
            db_borrados += 1

        db.commit()

        print(f"\n{'─'*50}")
        print(f"✅ Registros borrados en BD: {db_borrados}")
        print(f"✅ Archivos físicos borrados: {archivos_borrados}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
