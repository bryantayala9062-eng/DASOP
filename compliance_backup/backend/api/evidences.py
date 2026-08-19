from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload, joinedload
from typing import Optional
from datetime import datetime, timezone
import aiofiles
import os
import uuid
import hashlib
import logging
import threading
from core.backup import ejecutar_respaldo_compliance

from core.database import get_db
from core.dependencies import get_current_user
from models import all_models as models

logger = logging.getLogger("complianceop")

router = APIRouter(prefix="/api/evidences", tags=["Evidencias"])

UPLOAD_DIR = "uploads/evidences"
os.makedirs(UPLOAD_DIR, exist_ok=True)

REPORTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "reports")

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB

# ── Utilidades ────────────────────────────────────────────
def _log_action(db: Session, action: str, user_id: int, ip: str = None, **kwargs):
    """Registra una acción en el audit log documental."""
    log = models.DocumentAuditLog(
        action=action,
        user_id=user_id,
        ip_address=ip,
        evidence_id=kwargs.get("evidence_id"),
        report_id=kwargs.get("report_id"),
        file_name=kwargs.get("file_name"),
        file_path=kwargs.get("file_path"),
        file_size=kwargs.get("file_size"),
        detail=kwargs.get("detail"),
    )
    db.add(log)
    # Don't commit here — let the caller commit


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def evidence_to_dict(e: models.Evidence):
    uploader = None
    if e.uploader:
        uploader = {"id": e.uploader.id, "fullName": e.uploader.full_name}
    return {
        "id": e.id,
        "title": e.title,
        "fileName": e.file_name,
        "fileType": e.file_type,
        "fileSize": e.file_size,
        "fileSizeLabel": _size_label(e.file_size),
        "status": e.status,
        "controlId": e.control_id,
        "taskId": e.task_id,
        "reportId": e.report_id,
        "uploadedBy": uploader,
        "uploadDate": e.upload_date.isoformat() if e.upload_date else None,
        "downloadUrl": f"/api/evidences/{e.id}/download"
    }


def _size_label(size: Optional[int]) -> str:
    if not size:
        return "—"
    if size < 1024:
        return f"{size} B"
    elif size < 1024 ** 2:
        return f"{size // 1024} KB"
    else:
        return f"{round(size / 1024 ** 2, 1)} MB"


# ── CRUD ──────────────────────────────────────────────────
@router.get("")
def list_evidences(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    control_id: Optional[int] = Query(None),
    task_id: Optional[int] = Query(None),
    report_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None)
):
    q = db.query(models.Evidence).options(joinedload(models.Evidence.uploader))
    if control_id:
        q = q.filter(models.Evidence.control_id == control_id)
    if task_id:
        q = q.filter(models.Evidence.task_id == task_id)
    if report_id:
        q = q.filter(models.Evidence.report_id == report_id)
    if status:
        q = q.filter(models.Evidence.status == status)
    evidences = q.order_by(models.Evidence.upload_date.desc()).all()
    return [evidence_to_dict(e) for e in evidences]


@router.post("/upload", status_code=201)
async def upload_evidence(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    control_id: Optional[int] = Form(None),
    task_id: Optional[int] = Form(None),
    report_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Guardar archivo con nombre único
    ext = os.path.splitext(file.filename)[1].lower()
    
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Formato de archivo no permitido. Extensiones válidas: {', '.join(ALLOWED_EXTENSIONS)}")

    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    content = await file.read()
    
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="El archivo excede el tamaño máximo permitido de 25MB")

    async with aiofiles.open(file_path, "wb") as out:
        await out.write(content)

    evidence = models.Evidence(
        title=title,
        file_path=file_path,
        file_name=file.filename,
        file_type=file.content_type,
        file_size=len(content),
        control_id=control_id,
        task_id=task_id,
        report_id=report_id,
        uploaded_by_user_id=current_user.id,
        status="valid"
    )
    db.add(evidence)

    # Actualizar tarea si aplica
    if task_id:
        task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if task and task.status == "pending":
            task.status = "in_progress"

    db.flush()

    # Registrar en audit log
    _log_action(db, "upload", current_user.id,
                ip=_get_client_ip(request),
                evidence_id=evidence.id,
                report_id=report_id,
                file_name=file.filename,
                file_path=file_path,
                file_size=len(content),
                detail=f"Tipo: {file.content_type}")

    db.commit()
    db.refresh(evidence)
    
    # Trigger backup
    threading.Thread(target=ejecutar_respaldo_compliance, daemon=True).start()
    
    logger.info(f"[AUDIT] Upload: {file.filename} por {current_user.full_name}")
    return evidence_to_dict(evidence)


@router.get("/{evidence_id}/download")
def download_evidence(
    evidence_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    evidence = db.query(models.Evidence).filter(models.Evidence.id == evidence_id).first()
    if not evidence or not os.path.exists(evidence.file_path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    if current_user.role != "admin":
        if evidence.report and evidence.report.department != current_user.department:
            raise HTTPException(status_code=403, detail="No tienes permiso para descargar este archivo")
        if evidence.task and evidence.task.department != current_user.department:
            raise HTTPException(status_code=403, detail="No tienes permiso para descargar este archivo")

    # Registrar descarga en audit log
    _log_action(db, "download", current_user.id,
                ip=_get_client_ip(request),
                evidence_id=evidence.id,
                report_id=evidence.report_id,
                file_name=evidence.file_name,
                file_path=evidence.file_path,
                file_size=evidence.file_size)
    db.commit()
    logger.info(f"[AUDIT] Download: {evidence.file_name} por {current_user.full_name}")

    return FileResponse(
        path=evidence.file_path,
        filename=evidence.file_name,
        media_type=evidence.file_type
    )


@router.delete("/{evidence_id}", status_code=204)
def delete_evidence(
    evidence_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    evidence = db.query(models.Evidence).filter(models.Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidencia no encontrada")

    if current_user.role != "admin":
        if evidence.report and evidence.report.department != current_user.department:
            raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este archivo")
        if evidence.task and evidence.task.department != current_user.department:
            raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este archivo")

    # Registrar eliminación ANTES de borrar
    _log_action(db, "delete", current_user.id,
                ip=_get_client_ip(request),
                evidence_id=evidence.id,
                report_id=evidence.report_id,
                file_name=evidence.file_name,
                file_path=evidence.file_path,
                file_size=evidence.file_size,
                detail=f"Título: {evidence.title}")

    # Borrar archivo físico
    if evidence.file_path and os.path.exists(evidence.file_path):
        os.remove(evidence.file_path)
    db.delete(evidence)
    db.commit()
    
    # Trigger backup
    threading.Thread(target=ejecutar_respaldo_compliance, daemon=True).start()
    
    logger.info(f"[AUDIT] Delete: {evidence.file_name} por {current_user.full_name}")


# ── AUDIT LOG & TRAZABILIDAD (Día 10) ────────────────────
@router.get("/audit/log")
def get_audit_log(
    limit: int = Query(100, ge=1, le=500),
    action: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Historial de acciones sobre documentos (trazabilidad completa)."""
    q = db.query(models.DocumentAuditLog).options(
        joinedload(models.DocumentAuditLog.user)
    )
    if action:
        q = q.filter(models.DocumentAuditLog.action == action)

    logs = q.order_by(models.DocumentAuditLog.created_at.desc()).limit(limit).all()

    action_labels = {
        "upload": "📤 Subida",
        "download": "📥 Descarga",
        "delete": "🗑️ Eliminación",
        "integrity_check": "🔍 Auditoría de integridad"
    }

    return {
        "total": len(logs),
        "logs": [{
            "id": log.id,
            "action": log.action,
            "actionLabel": action_labels.get(log.action, log.action),
            "userName": log.user.full_name if log.user else "Sistema",
            "userDepartment": log.user.department if log.user else "—",
            "userId": log.user_id,
            "fileName": log.file_name,
            "fileSize": log.file_size,
            "fileSizeLabel": _size_label(log.file_size),
            "evidenceId": log.evidence_id,
            "reportId": log.report_id,
            "detail": log.detail,
            "ipAddress": log.ip_address,
            "createdAt": log.created_at.isoformat() if log.created_at else None
        } for log in logs]
    }


@router.get("/audit/integrity")
def check_integrity(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Verifica la integridad de todos los archivos almacenados:
    - Existencia en disco
    - Coincidencia de tamaño con el registro en BD
    """
    evidences = db.query(models.Evidence).all()

    results = []
    total_ok = 0
    total_missing = 0
    total_size_mismatch = 0
    total_files = len(evidences)

    for e in evidences:
        status = "ok"
        issues = []

        if not e.file_path:
            status = "error"
            issues.append("Sin ruta de archivo")
        elif not os.path.exists(e.file_path):
            status = "missing"
            issues.append("Archivo no encontrado en disco")
            total_missing += 1
        else:
            actual_size = os.path.getsize(e.file_path)
            if e.file_size and actual_size != e.file_size:
                status = "size_mismatch"
                issues.append(f"Tamaño en BD: {e.file_size}, en disco: {actual_size}")
                total_size_mismatch += 1
            else:
                total_ok += 1

        results.append({
            "evidenceId": e.id,
            "fileName": e.file_name,
            "filePath": e.file_path,
            "expectedSize": e.file_size,
            "status": status,
            "issues": issues
        })

    # Log the integrity check
    detail = f"Total: {total_files}, OK: {total_ok}, Faltantes: {total_missing}, Tamaño incorrecto: {total_size_mismatch}"
    _log_action(db, "integrity_check", current_user.id,
                ip=_get_client_ip(request),
                detail=detail)
    db.commit()

    logger.info(f"[AUDIT] Integrity check por {current_user.full_name}: {detail}")

    return {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "checkedBy": current_user.full_name,
        "summary": {
            "totalFiles": total_files,
            "ok": total_ok,
            "missing": total_missing,
            "sizeMismatch": total_size_mismatch,
            "integrityScore": round(total_ok / total_files * 100) if total_files > 0 else 100
        },
        "files": results
    }
