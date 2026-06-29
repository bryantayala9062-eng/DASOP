import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from core.database import SessionLocal
from models.all_models import Empresa
from api.dashboard.data_engine import DataEngine
import random
import string

def generate_dummy_rfc(name):
    # Toma primeras 3 letras del nombre (solo alfabeticas)
    letras = ''.join([c for c in name if c.isalpha()])[:3].upper()
    if len(letras) < 3:
        letras = (letras + 'XXX')[:3]
    
    # Random 3 chars para asegurar unicidad
    random_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=3))
    return f"{letras}010101{random_str}"

def run():
    print("Iniciando busqueda de empresas sin RFC...")
    engine = DataEngine()
    df = engine.df_facturas
    
    if df is None or df.empty:
        print("DataEngine no cargó datos.")
        return
        
    db = SessionLocal()
    try:
        # Empresas actuales en base de datos para no duplicar
        empresas_db = {e.razon_social.upper() for e in db.query(Empresa).all()}
        
        # Todas las empresas en el Excel
        empresas_excel = df['EMPRESA'].dropna().astype(str).str.strip().str.upper().unique()
        
        agregadas = 0
        
        for emp in empresas_excel:
            if not emp or emp == 'NAN':
                continue
                
            if emp not in empresas_db:
                # Generar un RFC dummy
                dummy_rfc = generate_dummy_rfc(emp)
                
                # Asegurar que el dummy RFC no exista (poco probable, pero por si acaso)
                while db.query(Empresa).filter(Empresa.rfc == dummy_rfc).first():
                    dummy_rfc = generate_dummy_rfc(emp)
                    
                nueva = Empresa(razon_social=emp, rfc=dummy_rfc)
                db.add(nueva)
                db.commit()
                agregadas += 1
                print(f"Agregada: {emp} (RFC Dummy: {dummy_rfc})")
                
        print(f"Proceso finalizado. {agregadas} nuevas empresas sin RFC fueron agregadas con RFCs generados.")
        
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == '__main__':
    run()
