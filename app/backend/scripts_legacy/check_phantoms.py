import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from core.database import SessionLocal
from models.all_models import Empresa

db = SessionLocal()
for nombre in ['COMERCIALIZADORA FRONTERIZA', 'MARYMICH']:
    r = db.query(Empresa).filter(Empresa.razon_social.ilike(f'%{nombre}%')).all()
    for e in r:
        print(f'Match para "{nombre}": ID={e.id} | {e.razon_social} | RFC={e.rfc}')
db.close()
