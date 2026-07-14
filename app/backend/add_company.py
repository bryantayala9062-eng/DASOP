import sys
sys.path.append('c:\\Users\\Administrador\\Desktop\\DashOP\\app\\backend')
from core.database import SessionLocal
from models.all_models import Empresa
import hashlib

db = SessionLocal()
empresa_name = "NAMUR MONS, S.A.P.I. DE C.V."

empresa = db.query(Empresa).filter(Empresa.razon_social == empresa_name).first()
if not empresa:
    hash_suffix = hashlib.md5(empresa_name.encode()).hexdigest()[:9].upper()
    empresa = Empresa(razon_social=empresa_name, rfc=f"XAXX{hash_suffix}")
    db.add(empresa)
    db.commit()
    print("Empresa agregada exitosamente:", empresa.id)
else:
    print("La empresa ya existe:", empresa.id)
