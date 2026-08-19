from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey, Float
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import datetime, timezone

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    legal_name = Column(String)
    rfc = Column(String, unique=True, index=True)
    industry = Column(String)

    # Relationships
    users = relationship("User", back_populates="organization")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    full_name = Column(String)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String)
    role = Column(String, default="user")
    department = Column(String, nullable=True)
    status = Column(String, default="active")
    is_active = Column(Boolean, default=True)
    mfa_enabled = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    organization = relationship("Organization", back_populates="users")
    tasks = relationship("Task", back_populates="assignee")

    # Property synonym to support seed.py / users.py password_hash
    @property
    def password_hash(self):
        return self.hashed_password

    @password_hash.setter
    def password_hash(self, value):
        self.hashed_password = value

    @property
    def initials(self):
        if not self.full_name:
            return "U"
        return ''.join(word[0].upper() for word in self.full_name.split() if word)

class Framework(Base):
    __tablename__ = "frameworks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    short_name = Column(String, index=True)
    version = Column(String)
    total_controls = Column(Integer, default=0)
    description = Column(Text, nullable=True)

    # Relationships
    controls = relationship("Control", back_populates="framework")
    audits = relationship("Audit", back_populates="framework")

class Control(Base):
    __tablename__ = "controls"

    id = Column(Integer, primary_key=True, index=True)
    framework_id = Column(Integer, ForeignKey("frameworks.id"), index=True)
    code = Column(String, index=True)
    title = Column(String)
    description = Column(Text, nullable=True)
    status = Column(String, default="non_compliant", index=True)
    responsible_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    due_date = Column(DateTime, nullable=True, index=True)
    last_review_date = Column(DateTime, nullable=True)

    # Relationships
    framework = relationship("Framework", back_populates="controls")
    responsible = relationship("User", foreign_keys=[responsible_user_id])
    tasks = relationship("Task", back_populates="control")

class Risk(Base):
    __tablename__ = "risks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    level = Column(String, default="medium", index=True)
    status = Column(String, default="open", index=True)
    probability = Column(Integer, default=3)          # 1-5
    impact = Column(Integer, default=3)               # 1-5
    mitigation_plan = Column(Text, nullable=True)
    control_id = Column(Integer, ForeignKey("controls.id"), nullable=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    identified_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    owner = relationship("User", foreign_keys=[owner_user_id])
    control = relationship("Control", foreign_keys=[control_id])

class Audit(Base):
    __tablename__ = "audits"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    type = Column(String, default="internal")
    framework_id = Column(Integer, ForeignKey("frameworks.id"), nullable=True, index=True)
    auditor_name = Column(String, nullable=True)
    scheduled_date = Column(DateTime, nullable=True, index=True)
    status = Column(String, default="planned", index=True)
    responsible_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    findings_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    framework = relationship("Framework", back_populates="audits")
    responsible = relationship("User", foreign_keys=[responsible_user_id])
    tasks = relationship("Task", back_populates="audit")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    status = Column(String, default="pending", index=True)
    priority = Column(String, default="medium", index=True)
    department = Column(String, nullable=True, index=True)  # legal/admin/tesoreria/contabilidad/ops/rh
    control_id = Column(Integer, ForeignKey("controls.id"), nullable=True, index=True)
    audit_id = Column(Integer, ForeignKey("audits.id"), nullable=True, index=True)
    due_date = Column(DateTime, nullable=True, index=True)
    completed_at = Column(DateTime, nullable=True)
    assignee_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    framework_ref = Column(String, nullable=True)
    requires_evidence = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    control = relationship("Control", back_populates="tasks")
    audit = relationship("Audit", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assignee_user_id], back_populates="tasks")
    evidences = relationship("Evidence", back_populates="task")

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    message = Column(Text)
    type = Column(String, default="informative", index=True)
    source = Column(String, default="system")
    is_read = Column(Boolean, default=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    related_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)
    related_control_id = Column(Integer, ForeignKey("controls.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    task = relationship("Task", foreign_keys=[related_task_id])
    control = relationship("Control", foreign_keys=[related_control_id])

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    title = Column(String, index=True)
    description = Column(Text)
    detected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    legal_deadline = Column(DateTime, nullable=True)
    status = Column(String, default="active", index=True)
    inai_notified = Column(Boolean, default=False)
    cert_mx_notified = Column(Boolean, default=False)
    containment_active = Column(Boolean, default=False)
    forensic_status = Column(String, default="not_started")
    responsible_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    responsible = relationship("User", foreign_keys=[responsible_user_id])

class Evidence(Base):
    __tablename__ = "evidences"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    file_path = Column(String)
    file_name = Column(String)
    file_type = Column(String)
    file_size = Column(Integer)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)
    control_id = Column(Integer, ForeignKey("controls.id"), nullable=True, index=True)
    report_id = Column(Integer, ForeignKey("department_reports.id"), nullable=True, index=True)
    kpi_eval_id = Column(Integer, ForeignKey("kpi_evaluations.id"), nullable=True, index=True)
    category = Column(String, nullable=True) # Cotizacion, Entregable, Comprobante_IMSS, Foto
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status = Column(String, default="pending", index=True)
    upload_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    task = relationship("Task", back_populates="evidences")
    control = relationship("Control", foreign_keys=[control_id])
    report = relationship("DepartmentReport", back_populates="evidences")
    kpi_eval = relationship("KPIEvaluation", back_populates="evidences")
    uploader = relationship("User", foreign_keys=[uploaded_by_user_id])

class ChecklistTemplate(Base):
    __tablename__ = "checklist_templates"

    id = Column(Integer, primary_key=True, index=True)
    department = Column(String, index=True)
    title = Column(String)
    description = Column(Text, nullable=True)
    periodicity = Column(String, default="monthly")
    is_active = Column(Boolean, default=True)

    items = relationship("ChecklistItem", back_populates="template", cascade="all, delete-orphan")
    responses = relationship("ChecklistResponse", back_populates="template")

class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("checklist_templates.id"), index=True)
    question = Column(String)
    requires_evidence = Column(Boolean, default=False)
    order = Column(Integer, default=0)

    template = relationship("ChecklistTemplate", back_populates="items")
    answers = relationship("ChecklistAnswer", back_populates="item")

class ChecklistResponse(Base):
    __tablename__ = "checklist_responses"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("checklist_templates.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    period = Column(String) # e.g. "2026-05"
    status = Column(String, default="draft") # draft, submitted, reviewed
    score = Column(Float, default=0.0)
    submitted_at = Column(DateTime, nullable=True)

    template = relationship("ChecklistTemplate", back_populates="responses")
    user = relationship("User", foreign_keys=[user_id])
    answers = relationship("ChecklistAnswer", back_populates="response", cascade="all, delete-orphan")

class ChecklistAnswer(Base):
    __tablename__ = "checklist_answers"

    id = Column(Integer, primary_key=True, index=True)
    response_id = Column(Integer, ForeignKey("checklist_responses.id"), index=True)
    item_id = Column(Integer, ForeignKey("checklist_items.id"), index=True)
    value = Column(String) # "yes", "no", "na"
    notes = Column(Text, nullable=True)
    evidence_id = Column(Integer, ForeignKey("evidences.id"), nullable=True, index=True)

    response = relationship("ChecklistResponse", back_populates="answers")
    item = relationship("ChecklistItem", back_populates="answers")
    evidence = relationship("Evidence", foreign_keys=[evidence_id])


# ─────────────────────────────────────────────────────────
# REPORTES EJECUTIVOS (Nuevo Hub C-Level)
# ─────────────────────────────────────────────────────────
class DepartmentReport(Base):
    __tablename__ = "department_reports"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    department = Column(String, index=True) # Legal, Operaciones, Facturación, RH, etc.
    period_month = Column(Integer)
    period_year = Column(Integer)
    description = Column(Text, nullable=True)
    status = Column(String, default="pending", index=True) # pending (no leído) | reviewed
    
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), index=True)
    upload_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    reviewed_at = Column(DateTime, nullable=True)

    # Relationships
    uploader = relationship("User", foreign_keys=[uploaded_by_user_id])
    evidences = relationship("Evidence", back_populates="report")


# ─────────────────────────────────────────────────────────
# EVALUACIÓN DE KPIS
# ─────────────────────────────────────────────────────────
class KPIEvaluation(Base):
    __tablename__ = "kpi_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    department = Column(String, index=True) # e.g. Operaciones
    period_month = Column(Integer)
    period_year = Column(Integer)
    global_score = Column(Float, default=0.0)
    collaborator_name = Column(String, nullable=True) # Nombre del subordinado/responsable
    comments = Column(Text, nullable=True)
    evaluated_by_user_id = Column(Integer, ForeignKey("users.id"), index=True)
    evaluation_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    evaluator = relationship("User", foreign_keys=[evaluated_by_user_id])
    evidences = relationship("Evidence", back_populates="kpi_eval")
    details = relationship("KPIEvaluationDetail", back_populates="evaluation", cascade="all, delete-orphan")

class KPIEvaluationDetail(Base):
    __tablename__ = "kpi_evaluation_details"

    id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(Integer, ForeignKey("kpi_evaluations.id"), index=True)
    kpi_name = Column(String)
    frequency = Column(String, nullable=True)
    target = Column(String, nullable=True)
    weight = Column(Float, nullable=True)
    compliance_month = Column(Float, nullable=True)
    compliance_weighted = Column(Float, nullable=True)
    status = Column(String, nullable=True)

    # Relationships
    evaluation = relationship("KPIEvaluation", back_populates="details")

class KPIDefinition(Base):
    __tablename__ = "kpi_definitions"

    id = Column(Integer, primary_key=True, index=True)
    department = Column(String, index=True)
    kpi_code = Column(String)
    description = Column(String)
    target_text = Column(String)
    weight = Column(Float)
    target_value = Column(Float)


# ─────────────────────────────────────────────────────────
# AUDIT LOG DOCUMENTAL (Día 10 — Trazabilidad)
# ─────────────────────────────────────────────────────────
class DocumentAuditLog(Base):
    __tablename__ = "document_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, index=True)  # upload, download, delete, integrity_check
    evidence_id = Column(Integer, ForeignKey("evidences.id"), nullable=True, index=True)
    report_id = Column(Integer, ForeignKey("department_reports.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    file_name = Column(String, nullable=True)
    file_path = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    detail = Column(Text, nullable=True)  # Extra info (e.g. integrity result)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    evidence = relationship("Evidence", foreign_keys=[evidence_id])

# ─────────────────────────────────────────────────────────
# CONTROL DE FIRMAS ELECTRÓNICAS (CONTABILIDAD)
# ─────────────────────────────────────────────────────────
class ElectronicSignature(Base):
    __tablename__ = "electronic_signatures"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True) # Nombre de la empresa o firma
    issue_date = Column(DateTime)     # Fecha inicial de vigencia
    expiration_date = Column(DateTime) # Fecha de vencimiento (calculada o fija)
    department = Column(String, default="Contabilidad", index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    creator = relationship("User", foreign_keys=[created_by_user_id])