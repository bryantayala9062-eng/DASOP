import os
import sys
import hashlib
import pandas as pd

# Asegurar que el backend está en la ruta
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_path = os.path.join(project_root, "app", "backend")
sys.path.insert(0, backend_path)

from core.database import SessionLocal
from models.all_models import Empresa

def sync_empresas():
    print("===========================================")
    print(" Sincronización de Emisoras a Materialidad")
    print("===========================================")
    
    excel_path = os.path.join(project_root, "app", "Bases_de_Datos", "dashboard_xml", "BaseDatosFACTURASoptimal.xlsx")
    
    if not os.path.exists(excel_path):
        print(f"[ERROR] No se encontró el archivo Excel en: {excel_path}")
        input("Presiona ENTER para salir...")
        return

    print("Cargando archivo Excel (esto puede tomar unos segundos)...")
    try:
        df = pd.read_excel(excel_path, engine='openpyxl', sheet_name='Facturas')
        # Estandarizar las columnas (quitar espacios y poner en mayusculas)
        df.columns = df.columns.astype(str).str.strip().str.upper()
    except Exception as e:
        print(f"[ERROR] Al leer el Excel: {e}")
        input("Presiona ENTER para salir...")
        return
        
    print("Columnas detectadas:", df.columns.tolist())
    
    if 'EMPRESA' not in df.columns:
        print("[ERROR] La columna 'EMPRESA' no existe en el Excel. Revisa el archivo.")
        input("Presiona ENTER para salir...")
        return

    empresas_erp = df[['EMPRESA', 'RFC_EMISOR']].dropna(subset=['EMPRESA']).drop_duplicates(subset=['EMPRESA'])
    print(f"Se detectaron {len(empresas_erp)} emisoras únicas en el Excel.")
    
    # Iniciar sesión de base de datos
    db = SessionLocal()
    
    try:
        # Obtener las que ya existen
        existentes_objs = db.query(Empresa).all()
        existentes_dict = {e.razon_social.strip().lower(): e for e in existentes_objs}
        
        print(f"Actualmente hay {len(existentes_objs)} empresas registradas en la Base de Datos.")
        
        nuevas = []
        actualizadas = 0
        
        for _, row in empresas_erp.iterrows():
            emp_name = str(row['EMPRESA']).strip()
            rfc_real = str(row['RFC_EMISOR']).strip().upper()
            if rfc_real == 'NAN' or not rfc_real:
                hash_suffix = hashlib.md5(emp_name.encode()).hexdigest()[:9].upper()
                rfc_real = f"XAXX{hash_suffix}"
                
            emp_key = emp_name.lower()
            if emp_name and emp_key not in existentes_dict:
                nueva_empresa = Empresa(razon_social=emp_name, rfc=rfc_real)
                db.add(nueva_empresa)
                nuevas.append(nueva_empresa)
                existentes_dict[emp_key] = nueva_empresa
            elif emp_key in existentes_dict:
                # Update if the existing RFC is a generic one (starts with XAXX) and the new one is real
                existente = existentes_dict[emp_key]
                if existente.rfc.startswith('XAXX') and not rfc_real.startswith('XAXX'):
                    existente.rfc = rfc_real
                    actualizadas += 1
        
        if nuevas or actualizadas > 0:
            print(f"Preparando la insersión de {len(nuevas)} nuevas empresas y {actualizadas} actualizaciones de RFC...")
            db.commit()
            print("[EXITO] Emisoras guardadas y actualizadas correctamente en la Base de Datos.")
        else:
            print("No hay emisoras nuevas ni RFCs que actualizar. El sistema ya está al día.")
            
    except Exception as e:
        db.rollback()
        print(f"[ERROR FATAL DE BD]: {e}")
    finally:
        db.close()
        
    print("\nProceso finalizado. Ya puedes abrir el portal ERP.")

if __name__ == "__main__":
    sync_empresas()
