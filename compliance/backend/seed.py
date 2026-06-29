"""
Seed enriquecido para ComplianceOp PRO
Ejecutar: python seed.py  (desde el venv)

Crea:
- 1 organización
- 7 usuarios (1 admin + 6 coordinadores por departamento)
- 2 frameworks fiscales/legales + 10 controles
- 12 tareas (2 por departamento)
- 8 alertas
- 3 riesgos internos
- 2 auditorías programadas
- 1 incidente activo con timer LFPDPPP 72h
"""

from core.database import engine, SessionLocal
from models import all_models as models
from core.security import get_password_hash
from datetime import datetime, timedelta

# Crear tablas
models.Base.metadata.create_all(bind=engine)

# ── Migraciones inline (SQLite no soporta ALTER automático) ──────────────────
with engine.connect() as conn:
    task_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(tasks)")]
    if "department" not in task_cols:
        conn.exec_driver_sql("ALTER TABLE tasks ADD COLUMN department VARCHAR")
        conn.commit()
        print("[MIGRACIÓN] Columna 'department' agregada a tasks")

    risk_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(risks)")]
    for col, col_type in [("probability", "INTEGER DEFAULT 3"),
                           ("impact", "INTEGER DEFAULT 3"),
                           ("mitigation_plan", "TEXT"),
                           ("control_id", "INTEGER"),
                           ("identified_date", "DATETIME")]:
        if col not in risk_cols:
            conn.exec_driver_sql(f"ALTER TABLE risks ADD COLUMN {col} {col_type}")
            conn.commit()
            print(f"[MIGRACIÓN] Columna '{col}' agregada a risks")


db = SessionLocal()

# ── Limpiar todo ─────────────────────────────────────────────────────────────
for model in [models.Evidence, models.Incident, models.Alert, models.Task,
              models.Audit, models.Risk, models.Control, models.Framework,
              models.User, models.Organization]:
    db.query(model).delete()
db.commit()

now = datetime.utcnow()

# ── Organización ─────────────────────────────────────────────────────────────
org = models.Organization(
    name="Optimal",
    legal_name="Optimal S.A. de C.V.",
    rfc="NSD260101ABC",
    industry="Despacho de servicios profesionales"
)
db.add(org)
db.flush()

# ── Usuarios ─────────────────────────────────────────────────────────────────
pwd = get_password_hash("123")

users_data = [
    ("bryant",            "Bryant",            "admin",   "Dirección"),
    ("gerentelegal",      "Ana Martinez",      "manager", "Legal"),
    ("gerenteadmin",      "Luis Herrera",      "manager", "Administración"),
    ("gerentetesoreria",  "Diana Flores",      "manager", "Tesorería"),
    ("gerentecontab",     "Roberto Sanchez",   "manager", "Contabilidad"),
    ("gerenteoperaciones","Patricia Vega",     "manager", "Operaciones"),
    ("gerentehr",         "Carlos Mendoza",    "manager", "RH"),
]

users = {}
for username, full_name, role, dept in users_data:
    u = models.User(
        username=username,
        full_name=full_name,
        hashed_password=pwd,
        role=role,
        department=dept,
        status="active",
        organization_id=org.id
    )
    db.add(u)
    db.flush()
    users[dept] = u

db.flush()

# ── Frameworks (solo fiscal/legal) ───────────────────────────────────────────
fw_lfpdppp = models.Framework(
    name="Ley Federal de Protección de Datos Personales",
    short_name="LFPDPPP",
    version="2010",
    total_controls=5,
    description="Regulación de tratamiento de datos personales en posesión de particulares"
)
fw_cff = models.Framework(
    name="Código Fiscal de la Federación",
    short_name="CFF",
    version="2024",
    total_controls=5,
    description="Obligaciones fiscales, conservación documental y cumplimiento tributario"
)
db.add_all([fw_lfpdppp, fw_cff])
db.flush()

# ── Controles ────────────────────────────────────────────────────────────────
controls_data = [
    # LFPDPPP
    (fw_lfpdppp.id, "LFP-001", "Aviso de privacidad actualizado y publicado",
     "Aviso de privacidad conforme al Art. 15-16 LFPDPPP", "compliant"),
    (fw_lfpdppp.id, "LFP-002", "Inventario de datos personales de clientes",
     "Registro de bases de datos personales Art. 37 RLFPDPPP", "partial"),
    (fw_lfpdppp.id, "LFP-003", "Procedimiento de atención a derechos ARCO",
     "Mecanismo para ejercer derechos de Acceso, Rectificación, Cancelación y Oposición", "non_compliant"),
    (fw_lfpdppp.id, "LFP-004", "Cláusula de datos en contratos con proveedores",
     "Art. 36 LFPDPPP — transferencia de datos personales", "compliant"),
    (fw_lfpdppp.id, "LFP-005", "Capacitación al personal en protección de datos",
     "Capacitación anual obligatoria en manejo de datos personales", "non_compliant"),
    # CFF
    (fw_cff.id, "CFF-001", "Conservación de contabilidad electrónica 5 años",
     "Art. 28 y 30 CFF — resguardo de XMLs, pólizas y auxiliares", "compliant"),
    (fw_cff.id, "CFF-002", "Emisión de CFDI en plazo legal",
     "Art. 29 CFF — emisión de comprobantes fiscales digitales", "compliant"),
    (fw_cff.id, "CFF-003", "Presentación de declaraciones en tiempo",
     "Art. 31 CFF — declaraciones provisionales y anuales", "partial"),
    (fw_cff.id, "CFF-004", "Buzón tributario activo y monitoreado",
     "Art. 17-K CFF — habilitación y revisión periódica del buzón", "non_compliant"),
    (fw_cff.id, "CFF-005", "Opinión de cumplimiento SAT positiva vigente",
     "Art. 32-D CFF — constancia de situación fiscal", "compliant"),
]

for fw_id, code, title, desc, status in controls_data:
    db.add(models.Control(
        framework_id=fw_id, code=code, title=title,
        description=desc, status=status,
        responsible_user_id=users["Dirección"].id,
        due_date=now + timedelta(days=90),
        last_review_date=now - timedelta(days=30)
    ))
db.flush()

# ── Tareas (2 por departamento) ──────────────────────────────────────────────
tasks_data = []

for code, title, desc, dept, priority, days_off, req_doc, status, fw_ref in tasks_data:
    db.add(models.Task(
        code=code, title=title, description=desc,
        department=dept, priority=priority,
        due_date=now + timedelta(days=days_off),
        requires_evidence=req_doc, status=status,
        framework_ref=fw_ref,
        assignee_user_id=users[dept].id
    ))
db.flush()

# ── Alertas ──────────────────────────────────────────────────────────────────
alerts_data = []

for title, msg, alert_type, user_id in alerts_data:
    db.add(models.Alert(
        title=title, message=msg, type=alert_type,
        source="system", user_id=user_id,
        created_at=now - timedelta(hours=2)
    ))
db.flush()

# ── Riesgos ──────────────────────────────────────────────────────────────────
risks_data = []

for title, desc, level, prob, impact, owner_id, mitigation in risks_data:
    db.add(models.Risk(
        title=title, description=desc, level=level,
        probability=prob, impact=impact,
        owner_user_id=owner_id,
        mitigation_plan=mitigation,
        identified_date=now - timedelta(days=15),
        status="open"
    ))
db.flush()

# ── Auditorías ───────────────────────────────────────────────────────────────
# (Limpiado para inicio en blanco)

# ── Incidente activo ─────────────────────────────────────────────────────────
# (Limpiado para inicio en blanco)

# ── Reporte final ────────────────────────────────────────────────────────────
print("=" * 60)
print("  [OK] SEED COMPLETO - ComplianceOp PRO")
print("=" * 60)
print(f"  Organizacion: {org.name}")
print(f"  Usuarios:     {len(users_data)} creados")
print(f"  Frameworks:   2 (LFPDPPP + CFF)")
print(f"  Controles:    10")
print(f"  Tareas:       0 (limpio)")
print(f"  Alertas:      0 (limpio)")
print(f"  Riesgos:      0 (limpio)")
print(f"  Auditorias:   0 (limpio)")
print(f"  Incidentes:   0 (limpio)")
print("-" * 60)
print("  ACCESOS:")
print("  bryant              / 123  (Super Admin)")
print("  gerentelegal        / 123  (Legal)")
print("  gerenteadmin        / 123  (Administracion)")
print("  gerentetesoreria    / 123  (Tesoreria)")
print("  gerentecontab       / 123  (Contabilidad)")
print("  gerenteoperaciones  / 123  (Operaciones)")
print("  gerentehr           / 123  (RH)")
print("=" * 60)
db.commit()
db.close()

