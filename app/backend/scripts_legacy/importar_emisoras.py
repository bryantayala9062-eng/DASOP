import os
import sys

# Añadir backend al path para poder importar módulos
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from database import SessionLocal
from models.all_models import Empresa
from api.dashboard.data_engine import DataEngine

def run():
    print("Iniciando carga de empresas emisoras desde DataEngine...")
    engine = DataEngine()
    df = engine.df_facturas
    
    if df is None or df.empty:
        print("DataEngine no cargó datos de facturas.")
        return
        
    print(f"Total registros cargados de Excel: {len(df)}")
    print(f"Columnas disponibles: {list(df.columns)}")
    
    empresa_col = None
    rfc_col = None
    
    # Buscar posibles columnas
    for col in df.columns:
        c = str(col).upper()
        if c == 'EMPRESA' or c == 'NOMBRE EMISOR' or c == 'EMISOR':
            if not empresa_col:
                empresa_col = col
        if c == 'RFC EMISOR' or c == 'RFC_EMISOR':
            if not rfc_col:
                rfc_col = col
                
    if not empresa_col and 'EMPRESA' in df.columns: empresa_col = 'EMPRESA'
    if not rfc_col and 'RFC EMISOR' in df.columns: rfc_col = 'RFC EMISOR'
        
    if not empresa_col or not rfc_col:
        print(f"No se pudieron determinar las columnas. Detectado: empresa_col={empresa_col}, rfc_col={rfc_col}")
        return
        
    print(f"Usando columna para razón social: {empresa_col}")
    print(f"Usando columna para RFC: {rfc_col}")
    
    unique_empresas = df[[empresa_col, rfc_col]].dropna().drop_duplicates()
    
    db = SessionLocal()
    try:
        agregadas = 0
        existentes = 0
        
        for _, row in unique_empresas.iterrows():
            razon_social = str(row[empresa_col]).strip().upper()
            rfc = str(row[rfc_col]).strip().upper()
            
            if not razon_social or not rfc or len(rfc) < 12:
                continue
                
            existe = db.query(Empresa).filter(Empresa.rfc == rfc).first()
            if existe:
                existentes += 1
            else:
                nueva = Empresa(razon_social=razon_social, rfc=rfc)
                db.add(nueva)
                db.commit()
                agregadas += 1
                print(f"Agregada: {razon_social} ({rfc})")
                
        print(f"Proceso finalizado. {agregadas} nuevas empresas agregadas. {existentes} ya existían.")
        
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == '__main__':
    run()
