from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone
from typing import Optional
import os
import shutil
import logging
import threading
from core.backup import ejecutar_respaldo_compliance

from core.database import get_db
from core.dependencies import get_current_user
from models.all_models import (
    User, DepartmentReport, Evidence, DocumentAuditLog,
    KPIEvaluation, ChecklistResponse, ChecklistTemplate
)

logger = logging.getLogger("complianceop")

router = APIRouter(prefix="/api/department-reports", tags=["Department Reports"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "reports")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("")
def list_reports(
    department: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(DepartmentReport).options(
        joinedload(DepartmentReport.uploader),
        joinedload(DepartmentReport.evidences)
    )

    if current_user.role != "admin":
        department = current_user.department

    if department:
        q = q.filter(DepartmentReport.department == department)
    if status:
        q = q.filter(DepartmentReport.status == status)
        
    reports = q.order_by(DepartmentReport.upload_date.desc()).all()
    
    result = []
    for r in reports:
        result.append({
            "id": r.id,
            "title": r.title,
            "department": r.department,
            "periodMonth": r.period_month,
            "periodYear": r.period_year,
            "description": r.description,
            "status": r.status,
            "uploaderName": r.uploader.full_name if r.uploader else "Sistema",
            "uploadDate": r.upload_date.isoformat() if r.upload_date else None,
            "reviewedAt": r.reviewed_at.isoformat() if r.reviewed_at else None,
            "evidences": [{"id": e.id, "fileName": e.file_name} for e in r.evidences]
        })
    return result

@router.post("")
def upload_report(
    request: Request,
    title: str = Form(...),
    department: str = Form(...),
    period_month: int = Form(...),
    period_year: int = Form(...),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    
    report = DepartmentReport(
        title=title,
        department=department,
        period_month=period_month,
        period_year=period_year,
        description=description,
        uploaded_by_user_id=current_user.id,
        upload_date=now,
        status="pending"
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    
    # Guardar archivo
    file_ext = os.path.splitext(file.filename)[1].lower()
    allowed_exts = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".png", ".jpg", ".jpeg"}
    
    if file_ext not in allowed_exts:
        db.delete(report)
        db.commit()
        raise HTTPException(status_code=400, detail="Formato de archivo no permitido")

    safe_filename = f"report_{report.id}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    content = file.file.read()
    if len(content) > 25 * 1024 * 1024:
        db.delete(report)
        db.commit()
        raise HTTPException(status_code=400, detail="El archivo excede el tamaño máximo de 25MB")

    with open(file_path, "wb") as buffer:
        buffer.write(content)
        
    evidence = Evidence(
        title=f"Archivo adjunto: {file.filename}",
        file_path=file_path,
        file_name=file.filename,
        file_size=len(content),
        report_id=report.id,
        uploaded_by_user_id=current_user.id,
        upload_date=now
    )
    db.add(evidence)
    
    # Audit log
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    audit = DocumentAuditLog(
        action="upload",
        user_id=current_user.id,
        report_id=report.id,
        file_name=file.filename,
        file_path=file_path,
        file_size=len(content),
        ip_address=ip,
        detail=f"Reporte: {title} | Depto: {department} | Periodo: {period_month}/{period_year}"
    )
    db.add(audit)
    db.commit()
    
    # Trigger backup
    threading.Thread(target=ejecutar_respaldo_compliance, daemon=True).start()
    
    logger.info(f"[AUDIT] Report upload: {file.filename} por {current_user.full_name} ({department} {period_month}/{period_year})")
    return {"message": "Reporte subido exitosamente", "report_id": report.id}

@router.put("/{report_id}/review")
def review_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Solo roles altos deberían poder hacer esto idealmente, pero por ahora lo dejamos genérico.
    report = db.query(DepartmentReport).filter(DepartmentReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
        
    report.status = "reviewed"
    report.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"message": "Reporte marcado como revisado"}


DEPARTMENTS = ["Legal", "Administración", "Tesorería", "Contabilidad", "Operaciones", "RH"]
MONTH_NAMES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]


@router.get("/period-status")
def get_period_status(
    year: Optional[int] = None,
    department: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Vista consolidada: para cada departamento × mes del año,
    muestra si tiene reporte, evaluación de KPIs y checklist completado.
    Día 9 del calendario: vinculación automática reportes ↔ periodo.
    """
    if not year:
        year = datetime.now(timezone.utc).year

    current_month = datetime.now(timezone.utc).month

    # 1. Reportes existentes (department, month) -> report info
    reports = db.query(DepartmentReport).filter(
        DepartmentReport.period_year == year
    ).options(joinedload(DepartmentReport.evidences)).all()

    report_map = {}
    for r in reports:
        key = (r.department, r.period_month)
        report_map[key] = {
            "id": r.id,
            "title": r.title,
            "status": r.status,
            "hasFile": len(r.evidences) > 0,
            "evidence": {
                "id": r.evidences[0].id,
                "file_name": r.evidences[0].file_name,
                "file_path": f"/api/evidences/{r.evidences[0].id}/download"
            } if r.evidences else None
        }

    # 2. Evaluaciones de KPIs (department, month) -> eval info
    evals = db.query(KPIEvaluation).options(joinedload(KPIEvaluation.evidences)).filter(
        KPIEvaluation.period_year == year
    ).all()

    eval_map = {}
    for e in evals:
        key = (e.department, e.period_month)
        eval_map[key] = {
            "id": e.id,
            "globalScore": e.global_score,
            "evidence": {
                "id": e.evidences[0].id,
                "file_name": e.evidences[0].file_name,
                "file_path": f"/api/evidences/{e.evidences[0].id}/download"
            } if e.evidences else None
        }

    # 3. Checklists completados (department, period "YYYY-MM") -> response info
    checklist_map = {}
    templates = db.query(ChecklistTemplate).filter(
        ChecklistTemplate.is_active == True
    ).all()

    template_dept_map = {t.department: t.id for t in templates}

    responses = db.query(ChecklistResponse).filter(
        ChecklistResponse.period.like(f"{year}-%"),
        ChecklistResponse.status == "submitted"
    ).all()

    for resp in responses:
        # Parse period "YYYY-MM" to get month
        try:
            month = int(resp.period.split("-")[1])
        except (ValueError, IndexError):
            continue
        # Find department from template
        tmpl = next((t for t in templates if t.id == resp.template_id), None)
        if tmpl:
            key = (tmpl.department, month)
            checklist_map[key] = {
                "score": resp.score,
                "status": resp.status
            }

    # Build the matrix
    if current_user.role == "admin":
        if department and department != "undefined" and department != "null" and department != "":
            visible_departments = [department]
        else:
            visible_departments = DEPARTMENTS
    else:
        visible_departments = [current_user.department]

    matrix = []
    for dept in visible_departments:
        if not dept:
            continue
        dept_row = {
            "department": dept,
            "months": []
        }
        for m in range(1, 13):
            key = (dept, m)
            has_report = key in report_map
            has_eval = key in eval_map
            has_checklist = key in checklist_map

            is_future = m > current_month

            completeness = 0
            if has_report:
                completeness += 1
            if has_eval:
                completeness += 1
            # if has_checklist:
            #     completeness += 1

            dept_row["months"].append({
                "month": m,
                "monthName": MONTH_NAMES[m],
                "isFuture": is_future,
                "report": report_map.get(key),
                "kpiEval": eval_map.get(key),
                "checklist": checklist_map.get(key),
                "completeness": completeness,  # 0-3
                "status": "complete" if completeness == 2
                         else "partial" if completeness > 0
                         else ("future" if is_future else "missing")
            })

        matrix.append(dept_row)

    return {
        "year": year,
        "currentMonth": current_month,
        "departments": DEPARTMENTS,
        "matrix": matrix
    }
