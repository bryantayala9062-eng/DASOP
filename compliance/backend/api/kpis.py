from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, timezone
import os
import uuid

from core.database import get_db
from models.all_models import User, KPIEvaluation, Evidence
from api.auth import get_current_user

router = APIRouter(prefix="/api/kpis", tags=["kpis"])

UPLOAD_DIR = "uploads/kpis"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/evaluation/upload")
async def upload_kpi_evaluation(
    department: str = Form(...),
    period_month: int = Form(...),
    period_year: int = Form(...),
    global_score: float = Form(...),
    collaborator_name: Optional[str] = Form(None),
    comments: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin" and department != current_user.department:
        raise HTTPException(status_code=403, detail="No tienes permiso para evaluar KPIs de otro departamento")

    # Read and save file
    file_ext = os.path.splitext(file.filename)[1]
    safe_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    file_size = len(content)

    # Check existing evaluation
    existing_eval = db.query(KPIEvaluation).filter(
        KPIEvaluation.department == department,
        KPIEvaluation.period_month == period_month,
        KPIEvaluation.period_year == period_year
    ).first()

    if existing_eval:
        existing_eval.global_score = global_score
        existing_eval.collaborator_name = collaborator_name
        existing_eval.comments = comments
        existing_eval.evaluated_by_user_id = current_user.id
        existing_eval.evaluation_date = datetime.now(timezone.utc)
        evaluation = existing_eval
        # Clean old evidence (optional, we could keep it, but lets replace)
        old_evidence = db.query(Evidence).filter(Evidence.kpi_eval_id == evaluation.id).all()
        for ev in old_evidence:
            try:
                os.remove(ev.file_path)
            except Exception:
                pass
        db.query(Evidence).filter(Evidence.kpi_eval_id == evaluation.id).delete()
    else:
        evaluation = KPIEvaluation(
            department=department,
            period_month=period_month,
            period_year=period_year,
            global_score=global_score,
            collaborator_name=collaborator_name,
            comments=comments,
            evaluated_by_user_id=current_user.id
        )
        db.add(evaluation)
        db.flush()

    # Create evidence
    evidence = Evidence(
        title=f"Reporte KPI {department} {period_month}/{period_year}",
        file_path=file_path,
        file_name=file.filename,
        file_type=file.content_type,
        file_size=file_size,
        kpi_eval_id=evaluation.id,
        category="KPI_Report",
        uploaded_by_user_id=current_user.id,
        status="reviewed"
    )
    db.add(evidence)
    db.commit()

    return {"message": "Evaluación de KPIs subida correctamente", "id": evaluation.id}

@router.get("/evaluation/history")
def get_kpi_history(
    department: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(KPIEvaluation).options(joinedload(KPIEvaluation.evidences), joinedload(KPIEvaluation.evaluator))
    
    if current_user.role != "admin":
        department = current_user.department
        
    if department and department != "undefined" and department != "null" and department != "":
        query = query.filter(KPIEvaluation.department == department)
        
    if year:
        query = query.filter(KPIEvaluation.period_year == year)
        
    evaluations = query.order_by(KPIEvaluation.period_month.desc()).all()
    
    result = []
    for e in evaluations:
        result.append({
            "id": e.id,
            "department": e.department,
            "period_month": e.period_month,
            "period_year": e.period_year,
            "global_score": e.global_score,
            "collaborator_name": e.collaborator_name,
            "comments": e.comments,
            "evaluation_date": e.evaluation_date.isoformat() if e.evaluation_date else None,
            "evaluator_name": e.evaluator.full_name if e.evaluator else "Desconocido",
            "evidence": {
                "id": e.evidences[0].id,
                "file_name": e.evidences[0].file_name,
                "file_path": f"/api/evidences/{e.evidences[0].id}/download"
            } if e.evidences else None
        })
        
    return result


@router.delete("/evaluation/{eval_id}", status_code=204)
def delete_kpi_evaluation(
    eval_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina una evaluación de KPIs y sus evidencias. Solo admin."""
    evaluation = db.query(KPIEvaluation).filter(KPIEvaluation.id == eval_id).first()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")

    if current_user.role != "admin" and evaluation.department != current_user.department:
        raise HTTPException(status_code=403, detail="Solo administradores pueden eliminar evaluaciones de otros departamentos")

    # Eliminar evidencias asociadas
    evidences = db.query(Evidence).filter(Evidence.kpi_eval_id == eval_id).all()
    for ev in evidences:
        if ev.file_path and os.path.exists(ev.file_path):
            try:
                os.remove(ev.file_path)
            except Exception:
                pass
        db.delete(ev)

    db.delete(evaluation)
    db.commit()

    return None
