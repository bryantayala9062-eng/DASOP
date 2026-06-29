from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta

from core.database import get_db
from core.dependencies import get_current_user
from models import all_models as models

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary")
def get_summary(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Vista General Ejecutiva — KPIs principales"""

    # Cumplimiento global (promedio de todos los frameworks)
    frameworks = db.query(models.Framework).all()
    total_controls_all = sum(f.total_controls for f in frameworks)
    compliant_controls_all = sum(
        db.query(models.Control).filter(
            models.Control.framework_id == f.id,
            models.Control.status == "compliant"
        ).count()
        for f in frameworks
    )
    global_compliance = round((compliant_controls_all / total_controls_all * 100) if total_controls_all > 0 else 0)

    # Base queries con filtros de seguridad
    risk_q = db.query(models.Risk)
    task_q = db.query(models.Task)
    inc_q = db.query(models.Incident)
    
    if current_user.role != "admin":
        dept = current_user.department
        risk_q = risk_q.join(models.User, models.Risk.owner_user_id == models.User.id).filter(models.User.department == dept)
        task_q = task_q.filter(models.Task.department == dept)
        inc_q = inc_q.join(models.User, models.Incident.responsible_user_id == models.User.id).filter(models.User.department == dept)

    # Riesgos activos
    total_risks = risk_q.filter(models.Risk.status == "open").count()
    critical_risks = risk_q.filter(models.Risk.status == "open", models.Risk.level == "critical").count()
    high_risks = risk_q.filter(models.Risk.status == "open", models.Risk.level == "high").count()
    medium_risks = risk_q.filter(models.Risk.status == "open", models.Risk.level == "medium").count()

    # Tareas pendientes
    now = datetime.utcnow()
    total_tasks = task_q.filter(
        models.Task.status.in_(["pending", "in_progress", "overdue"])
    ).count()
    overdue_tasks = task_q.filter(
        models.Task.due_date < now,
        models.Task.status.notin_(["completed"])
    ).count()
    due_today = task_q.filter(
        models.Task.due_date >= now.replace(hour=0, minute=0, second=0),
        models.Task.due_date <= now.replace(hour=23, minute=59, second=59),
        models.Task.status.notin_(["completed"])
    ).count()

    # Próximas auditorías
    upcoming_audits = db.query(models.Audit).filter(
        models.Audit.scheduled_date >= now,
        models.Audit.status == "planned"
    ).order_by(models.Audit.scheduled_date).all()

    next_audit = None
    days_to_next = None
    if upcoming_audits:
        next_a = upcoming_audits[0]
        days_to_next = (next_a.scheduled_date - now).days
        next_audit = {
            "id": next_a.id,
            "title": next_a.title,
            "date": next_a.scheduled_date.isoformat(),
            "daysUntil": days_to_next,
            "auditorName": next_a.auditor_name
        }

    # Cumplimiento por framework
    frameworks_data = []
    for f in frameworks:
        compliant = db.query(models.Control).filter(
            models.Control.framework_id == f.id,
            models.Control.status == "compliant"
        ).count()
        pct = round((compliant / f.total_controls * 100) if f.total_controls > 0 else 0)
        frameworks_data.append({
            "id": f.id,
            "name": f.name,
            "shortName": f.short_name,
            "totalControls": f.total_controls,
            "compliantControls": compliant,
            "compliancePercentage": pct,
            "compliance": pct
        })

    # KRIs (Indicadores Clave de Riesgo)
    kris = [
        {
            "name": "Vulnerabilidades Críticas",
            "label": "Vulnerabilidades Críticas",
            "value": critical_risks,
            "status": "critical" if critical_risks > 0 else "normal",
            "trend": "up" if critical_risks > 0 else "stable"
        },
        {
            "name": "Controles Vencidos",
            "label": "Controles Vencidos",
            "value": db.query(models.Control).filter(
                models.Control.due_date < now,
                models.Control.status != "compliant"
            ).count(),
            "status": "warning",
            "trend": "down"
        },
        {
            "name": "Proveedores Sin Evaluar",
            "label": "Proveedores Sin Evaluar",
            "value": 5,  # placeholder hasta tener módulo proveedores
            "status": "warning",
            "trend": "stable"
        },
        {
            "name": "Incidentes Abiertos",
            "label": "Incidentes Abiertos",
            "value": inc_q.filter(models.Incident.status == "active").count(),
            "status": "normal",
            "trend": "down"
        },
        {
            "name": "Tareas Atrasadas",
            "label": "Tareas Atrasadas",
            "value": overdue_tasks,
            "status": "warning" if overdue_tasks > 0 else "normal",
            "trend": "up" if overdue_tasks > 0 else "stable"
        },
        {
            "name": "Políticas por Revisar",
            "label": "Políticas por Revisar",
            "value": 2,  # placeholder
            "status": "normal",
            "trend": "stable"
        }
    ]

    # Próximos hitos (auditorías + tareas críticas)
    milestones = []
    for audit in upcoming_audits[:5]:
        milestones.append({
            "date": audit.scheduled_date.isoformat(),
            "title": audit.title,
            "type": "Auditoría",
            "priority": "high"
        })

    critical_tasks = task_q.options(joinedload(models.Task.assignee)).filter(
        models.Task.due_date >= now,
        models.Task.status.notin_(["completed"]),
        models.Task.priority.in_(["critical", "high"])
    ).order_by(models.Task.due_date).limit(5).all()

    for t in critical_tasks:
        milestones.append({
            "date": t.due_date.isoformat() if t.due_date else None,
            "title": t.title,
            "type": "Tarea",
            "priority": t.priority
        })

    milestones.sort(key=lambda x: x["date"] or "")

    next_audit_str = f"{upcoming_audits[0].scheduled_date.strftime('%d %b')}" if upcoming_audits else "Ninguna"

    return {
        "globalCompliance": global_compliance,
        "compliance_overall": global_compliance,
        "active_risks": total_risks,
        "pending_tasks": total_tasks,
        "next_audit": next_audit_str,
        "risks": {
            "total": total_risks,
            "critical": critical_risks,
            "high": high_risks,
            "medium": medium_risks
        },
        "tasks": {
            "total": total_tasks,
            "overdue": overdue_tasks,
            "dueToday": due_today
        },
        "upcomingAudits": {
            "count": len(upcoming_audits),
            "next": next_audit
        },
        "frameworkCompliance": frameworks_data,
        "kris": kris,
        "milestones": milestones[:8]
    }


@router.get("/my-tasks")
def get_my_tasks(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Mis Tareas Pendientes para el usuario actual"""
    now = datetime.utcnow()

    tasks = db.query(models.Task).options(joinedload(models.Task.assignee)).filter(
        models.Task.assignee_user_id == current_user.id,
        models.Task.status.notin_(["completed"])
    ).order_by(models.Task.due_date).all()

    # Auto-marcar overdue
    for task in tasks:
        if task.due_date and task.due_date < now and task.status != "overdue":
            task.status = "overdue"
    db.commit()

    overdue = [t for t in tasks if t.status == "overdue"]
    in_progress = [t for t in tasks if t.status == "in_progress"]
    pending = [t for t in tasks if t.status == "pending"]

    completed_this_month = db.query(models.Task).filter(
        models.Task.assignee_user_id == current_user.id,
        models.Task.status == "completed",
        models.Task.completed_at >= now.replace(day=1)
    ).count()

    def task_to_dict(t):
        days_diff = None
        delay_label = None
        if t.due_date:
            diff = (t.due_date - now).days
            if diff < 0:
                delay_label = f"{abs(diff)}d de retraso"
            elif diff == 0:
                delay_label = "hoy"
            else:
                delay_label = f"en {diff}d"
            days_diff = diff

        return {
            "id": t.id,
            "code": t.code,
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "frameworkRef": t.framework_ref,
            "dueDate": t.due_date.isoformat() if t.due_date else None,
            "delayLabel": delay_label,
            "requiresEvidence": t.requires_evidence
        }

    return {
        "summary": {
            "overdue": len(overdue),
            "inProgress": len(in_progress),
            "pending": len(pending),
            "completedThisMonth": completed_this_month
        },
        "tasks": [task_to_dict(t) for t in tasks]
    }
