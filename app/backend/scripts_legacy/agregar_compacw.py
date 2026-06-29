import sys, os
import pandas as pd

sys.path.append(os.path.abspath(r'C:\Users\Administrador\Desktop\DashOP\app\backend'))
from core.database import SessionLocal
from models.all_models import Empresa
from sqlalchemy import text

def main():
    db = SessionLocal()
    df = pd.read_excel(r'C:\Users\Administrador\Desktop\DashOP\Emisoras_Extraidas_Compacw.xlsx')
    
    agregadas = 0
    for _, row in df.iterrows():
        rfc = str(row['RFC']).strip()
        nombre = str(row['Razon_Social']).strip()
        
        existe = db.query(Empresa).filter(Empresa.rfc == rfc).first()
        if not existe:
            db.execute(text("INSERT INTO empresas (razon_social, rfc) VALUES (:nombre, :rfc)"), {"nombre": nombre, "rfc": rfc})
            agregadas += 1
            print(f"  + Agregada de Compacw: {nombre} ({rfc})")
            
    if agregadas > 0:
        db.commit()
        print(f"Se agregaron {agregadas} nuevas empresas a la Base de Datos.")
    else:
        print("No hubo empresas nuevas que agregar de Compacw.")

if __name__ == '__main__':
    main()
