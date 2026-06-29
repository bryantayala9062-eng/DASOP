from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
import os
import shutil
from docxtpl import DocxTemplate, RichText

from core.database import get_db
from models.all_models import Contrato, Bitacora, Usuario, Comentario, DocumentoMaterialidad, Empresa
from core.security import require_mod_legal
from core.backup import ejecutar_respaldo
import re
import threading
from api.legal.schemas import ContratoBase, ContratoResponse, BitacoraResponse, ComentarioRequest, ComentarioResponse, EstatusUpdate, QuickContratoRequest
from api.legal import email_utils

router = APIRouter(prefix="/api/legal", tags=["legal"])

# --- HELPERS ---
FLOW_STEPS = [
    "hecho", "jc_carlos", "cliente", "recolector", "firmas", "notaria", "optimal"
]

STATUS_LIMITS = {
    "hecho": 3,
    "jc_carlos": 3,
    "cliente": 3,
    "recolector": 3,
    "firmas": 3,
    "notaria": 90
}

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "uploads", "legal")
os.makedirs(UPLOAD_DIR, exist_ok=True)

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "templates")

def calcular_alerta(estatus: str, last_update: datetime) -> dict:
    now = datetime.utcnow()
    if not last_update:
        return {"days": 0, "alert": "ERROR"}
    days = (now - last_update).days
    limit = STATUS_LIMITS.get(estatus, 999)
    alert_msg = "OK"
    if days > limit:
        alert_msg = f"WARN_{estatus}"
    return {"days": days, "alert": alert_msg}

def registrar_bitacora(db: Session, contrato_id: int, usuario_id: int, accion: str, detalles: str):
    b = Bitacora(
        contrato_id=contrato_id,
        usuario_id=usuario_id,
        accion=accion,
        detalles=detalles,
        fecha=datetime.utcnow()
    )
    db.add(b)

def _build_response(c, info=None, db=None):
    if info is None:
        info = calcular_alerta(str(c.estatus), c.fecha_actualizacion)
    # Determinar si tiene PDF: propio o desde Materialidad
    tiene_pdf = bool(c.archivo_path)
    if not tiene_pdf and db is not None:
        mat_doc = db.query(DocumentoMaterialidad).filter(
            DocumentoMaterialidad.contrato_id == c.id,
            DocumentoMaterialidad.tipo_documento == "CONTRATO_MARCO",
        ).first()
        tiene_pdf = mat_doc is not None
    return {
        "id": c.id,
        "cliente": c.cliente,
        "tipo_contrato": c.tipo_contrato,
        "responsable_interno": c.responsable_interno,
        "email_responsable": c.email_responsable,
        "email_legal": c.email_legal,
        "estatus": c.estatus,
        "fecha_creacion": c.fecha_creacion,
        "fecha_actualizacion": c.fecha_actualizacion,
        "dias_en_estatus": info["days"],
        "alerta": info["alert"],
        "archivo_path": c.archivo_path,
        "tiene_pdf": tiene_pdf,
        "empresa_id": c.empresa_id,
        "empresa": c.empresa,
        "concepto": c.concepto,
        "fecha_inicio": c.fecha_inicio.isoformat() if c.fecha_inicio else None,
        "fecha_fin": c.fecha_fin.isoformat() if c.fecha_fin else None,
    }

# ============================================================
#  CONTRATOS CRUD
# ============================================================

@router.get("/contratos", response_model=List[ContratoResponse])
def listar_contratos(
    empresa: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_legal)
):
    """Lista contratos. Se pueden filtrar por empresa y/o cliente (coincidencia parcial, case-insensitive)."""
    query = db.query(Contrato)
    if not current_user.es_admin and current_user.empresa_filtro:
        query = query.filter(Contrato.empresa == current_user.empresa_filtro)
    if empresa:
        query = query.filter(Contrato.empresa.ilike(f"%{empresa}%"))
    if cliente:
        query = query.filter(Contrato.cliente.ilike(f"%{cliente}%"))
    if status:
        query = query.filter(Contrato.estatus == status)

    contratos = query.order_by(Contrato.fecha_actualizacion.desc()).all()
    return [_build_response(c, db=db) for c in contratos]


@router.post("/contratos")
async def crear_contrato(contrato: ContratoBase, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_legal)):
    # Prepare model
    c_data = contrato.model_dump(exclude={"declaraciones_cliente", "representante_empresa", "gen_template"})
    c = Contrato(**c_data)

    if contrato.gen_template and contrato.empresa and contrato.tipo_contrato:
        base_template_path = os.path.join(TEMPLATES_DIR, contrato.empresa, contrato.tipo_contrato)
        template_path = None
        if os.path.isdir(base_template_path):
            for f in os.listdir(base_template_path):
                if f.endswith(".docx") and not f.startswith("~$"):
                    template_path = os.path.join(base_template_path, f)
                    break
        elif os.path.exists(base_template_path + ".docx"):
            template_path = base_template_path + ".docx"
            
        if template_path:
            doc = DocxTemplate(template_path)
            rt_empresa = RichText(contrato.empresa.upper(), bold=True)
            rt_rep_empresa = RichText((contrato.representante_empresa or "").upper(), bold=True)
            rt_cliente = RichText(contrato.cliente.upper(), bold=True)
            rt_rep_cliente = RichText((contrato.representante_cliente or "").upper(), bold=True) if contrato.representante_cliente else ""
            
            context = {
                'nombre_de_la_empresa': rt_empresa,
                'representante_legal': rt_rep_empresa,
                'nombre_del_cliente': rt_cliente,
                'representante_legal_del_cliente': rt_rep_cliente,
                'declaraciones_del_cliente': contrato.declaraciones_cliente or "",
                'concepto_de_la_factura': contrato.concepto or "",
                'vigencia_del_contrato': f"{contrato.periodo or ''} {contrato.clave_periodo or ''}",
                'fecha_del_contrato': contrato.fecha_inicio.strftime("%d de %m de %Y") if contrato.fecha_inicio else ""
            }
            doc.render(context)
            filename = f"{contrato.tipo_contrato}_{contrato.cliente[:15]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx".replace(" ", "_").replace("/", "_")
            file_path = os.path.join(UPLOAD_DIR, filename)
            doc.save(file_path)
            c.archivo_path = file_path

    db.add(c)
    try:
        db.commit()
        db.refresh(c)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear contrato: {e}")

    registrar_bitacora(db, c.id, current_user.id, "CREACION", f"Contrato creado para {contrato.cliente}" + (" (Auto-generado)" if contrato.gen_template else ""))
    db.commit()

    # Enviar correo de confirmación en background
    if contrato.email_responsable:
        background_tasks.add_task(
            email_utils.send_creation_email,
            contrato.email_responsable, c.id, contrato.cliente,
            contrato.tipo_contrato, contrato.responsable_interno
        )
        
    threading.Thread(target=ejecutar_respaldo, daemon=True).start()

    return _build_response(c)


@router.post("/contratos/quick")
async def crear_contrato_rapido(
    req: QuickContratoRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    current_user: Usuario = Depends(require_mod_legal)
):
    """Crea un contrato básico desde el módulo de Materialidad para vinculación inmediata."""
    empresa = db.query(Empresa).filter(Empresa.id == req.empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    nuevo = Contrato(
        cliente=req.cliente.upper(),
        empresa_id=req.empresa_id,
        empresa=empresa.razon_social,
        tipo_contrato=req.tipo_contrato,
        concepto=req.concepto or "CONTRATO CREADO DESDE MATERIALIDAD",
        responsable_interno=current_user.nombre or current_user.username,
        email_responsable=current_user.email or "legal@op-dash.com",
        estatus="hecho"
    )
    db.add(nuevo)
    try:
        db.commit()
        db.refresh(nuevo)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear contrato: {e}")

    threading.Thread(target=ejecutar_respaldo, daemon=True).start()

    return _build_response(nuevo)





@router.put("/contratos/{contract_id}")
def editar_contrato(contract_id: int, contrato: ContratoBase, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_legal)):
    c = db.query(Contrato).filter(Contrato.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")

    cambios = []
    if c.cliente != contrato.cliente:
        cambios.append(f"Cliente: {contrato.cliente}")
    if c.tipo_contrato != contrato.tipo_contrato:
        cambios.append(f"Tipo: {contrato.tipo_contrato}")
    if c.responsable_interno != contrato.responsable_interno:
        cambios.append(f"Resp: {contrato.responsable_interno}")

    c.cliente = contrato.cliente
    c.tipo_contrato = contrato.tipo_contrato
    c.responsable_interno = contrato.responsable_interno
    c.email_responsable = contrato.email_responsable
    c.email_legal = contrato.email_legal
    c.fecha_actualizacion = datetime.utcnow()

    if cambios:
        registrar_bitacora(db, c.id, current_user.id, "EDITADO", ", ".join(cambios))

    db.commit()

    return {"id": c.id, "message": "Actualizado exitosamente"}


@router.delete("/contratos/{contract_id}")
def eliminar_contrato(contract_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_legal)):
    c = db.query(Contrato).filter(Contrato.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")

    db.query(Bitacora).filter(Bitacora.contrato_id == contract_id).delete()
    db.query(Comentario).filter(Comentario.contrato_id == contract_id).delete()
    db.delete(c)
    db.commit()
    return {"id": contract_id, "message": "Eliminado exitosamente"}


@router.put("/contratos/{contract_id}/avanzar")
async def avanzar_estatus(contract_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_legal)):
    c = db.query(Contrato).filter(Contrato.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")

    try:
        idx = FLOW_STEPS.index(str(c.estatus))
        if idx < len(FLOW_STEPS) - 1:
            old_status = c.estatus
            nuevo_estatus = FLOW_STEPS[idx + 1]
            c.estatus = nuevo_estatus
            c.fecha_actualizacion = datetime.utcnow()
            registrar_bitacora(db, c.id, current_user.id, "AVANCE", f"Cambio de {old_status} a {nuevo_estatus}")
            db.commit()

            # Enviar correo de avance en background
            background_tasks.add_task(
                email_utils.send_status_email,
                c.email_responsable, c.id, c.cliente, nuevo_estatus
            )

            return {"previous": old_status, "new": nuevo_estatus}
        raise HTTPException(status_code=400, detail="Ya está en estatus final")
    except ValueError:
        raise HTTPException(status_code=400, detail="Estatus inválido")


@router.put("/contratos/{contract_id}/estatus")
def cambiar_estatus_directo(
    contract_id: int,
    payload: EstatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_legal)
):
    """Cambia el estatus directamente a cualquier etapa del flujo."""
    c = db.query(Contrato).filter(Contrato.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    if payload.estatus not in FLOW_STEPS:
        raise HTTPException(status_code=400, detail=f"Estatus inválido: {payload.estatus}")

    old_status = c.estatus
    c.estatus = payload.estatus
    c.fecha_actualizacion = datetime.utcnow()
    registrar_bitacora(db, c.id, current_user.id, "CAMBIO_ESTATUS",
                       f"Cambio manual de {old_status} → {payload.estatus}")
    db.commit()

    background_tasks.add_task(
        email_utils.send_status_email,
        c.email_responsable, c.id, c.cliente, payload.estatus
    )

    return {"previous": old_status, "new": payload.estatus}


# ============================================================
#  FILE UPLOAD / DOWNLOAD
# ============================================================

def abbreviate_name(name: str, max_words=3) -> str:
    if not name:
        return "DESCONOCIDO"
    name = re.sub(r'(?i)\b(S\.?A\.?\s*DE\s*C\.?V\.?|S\.?A\.?P\.?I\.?\s*DE\s*C\.?V\.?|S\.?A\.?|S\.?C\.?)\b', '', name).strip()
    words = [w for w in re.split(r'[\s\.\,]+', name) if w]
    return "_".join(words[:max_words]).upper()

@router.post("/contratos/{contract_id}/archivo")
async def subir_archivo(
    contract_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_legal)
):
    c = db.query(Contrato).filter(Contrato.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")

    # Obtener el nombre de la empresa para armar el nombre
    emp = db.query(Empresa).filter(Empresa.id == c.empresa_id).first()
    emp_name = abbreviate_name(emp.razon_social if emp else "EMPRESA")
    cli_name = abbreviate_name(c.cliente)

    ext = os.path.splitext(file.filename)[1] if file.filename else ".pdf"
    filename = f"CONTRATO_{emp_name}_{cli_name}{ext}"
    
    file_path = os.path.join(UPLOAD_DIR, filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    c.archivo_path = file_path
    registrar_bitacora(db, c.id, current_user.id, "ARCHIVO_SUBIDO", f"Archivo: {filename}")
    db.commit()
    
    # Lanzar respaldo en background
    threading.Thread(target=ejecutar_respaldo, daemon=True).start()
    
    return {"filename": filename, "message": "Archivo subido exitosamente"}


@router.get("/contratos/{contract_id}/archivo")
def descargar_archivo(
    contract_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_legal)
):
    c = db.query(Contrato).filter(Contrato.id == contract_id).first()
    if not c or not c.archivo_path:
        raise HTTPException(status_code=404, detail="Este contrato no tiene archivo adjunto")
    if not os.path.exists(c.archivo_path):
        raise HTTPException(status_code=404, detail="El archivo físico no se encuentra en el servidor")
    return FileResponse(c.archivo_path, filename=os.path.basename(c.archivo_path))



@router.get("/contratos/{contract_id}/materialidad")
def obtener_documentos_materialidad(contract_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_legal)):
    c = db.query(Contrato).filter(Contrato.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")

    if not c.empresa_id:
        return {"empresa_id": None, "documentos": []}

    documentos = (
        db.query(DocumentoMaterialidad)
        .filter(DocumentoMaterialidad.empresa_id == c.empresa_id)
        .order_by(DocumentoMaterialidad.fecha_subida.desc())
        .all()
    )

    return {
        "empresa_id": c.empresa_id,
        "documentos": [
            {
                "id": d.id,
                "tipo_documento": d.tipo_documento,
                "fecha_subida": d.fecha_subida.isoformat(),
                "resultado_op": d.resultado_op,
                "periodo": d.periodo,
            }
            for d in documentos
        ]
    }

# ============================================================
#  BITACORA & COMENTARIOS
# ============================================================


@router.get("/contratos/{contract_id}/bitacora", response_model=List[BitacoraResponse])
def obtener_bitacora(contract_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_legal)):
    logs = db.query(Bitacora, Usuario.nombre).outerjoin(
        Usuario, Bitacora.usuario_id == Usuario.id
    ).filter(Bitacora.contrato_id == contract_id).order_by(Bitacora.fecha.desc()).all()

    return [
        {
            "id": log.id,
            "usuario_id": log.usuario_id,
            "usuario_nombre": nombre if nombre else "Sistema",
            "accion": log.accion,
            "detalles": log.detalles,
            "fecha": log.fecha
        }
        for log, nombre in logs
    ]


@router.post("/contratos/{contract_id}/comentarios", response_model=ComentarioResponse)
def agregar_comentario(contract_id: int, req: ComentarioRequest, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_legal)):
    c = db.query(Contrato).filter(Contrato.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")

    com = Comentario(
        contrato_id=contract_id,
        usuario_id=current_user.id,
        texto=req.texto,
        fecha=datetime.utcnow()
    )
    db.add(com)
    db.commit()
    db.refresh(com)

    return {
        "id": com.id,
        "usuario_id": current_user.id,
        "usuario_nombre": current_user.nombre,
        "texto": com.texto,
        "fecha": com.fecha
    }


@router.get("/contratos/{contract_id}/comentarios", response_model=List[ComentarioResponse])
def obtener_comentarios(contract_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_legal)):
    comments = db.query(Comentario, Usuario.nombre).join(
        Usuario, Comentario.usuario_id == Usuario.id
    ).filter(Comentario.contrato_id == contract_id).order_by(Comentario.fecha.asc()).all()

    return [
        {
            "id": com.id,
            "usuario_id": com.usuario_id,
            "usuario_nombre": nombre,
            "texto": com.texto,
            "fecha": com.fecha
        }
        for com, nombre in comments
    ]


# ============================================================
#  METRICS / ESTADÍSTICAS & TEMPLATES
# ============================================================

@router.get("/templates/empresas")
def get_template_companies(current_user: Usuario = Depends(require_mod_legal)):
    if not os.path.exists(TEMPLATES_DIR):
        return []
    return sorted([d for d in os.listdir(TEMPLATES_DIR) if os.path.isdir(os.path.join(TEMPLATES_DIR, d))])

@router.get("/templates/tipos/{empresa}")
def get_template_types(empresa: str, current_user: Usuario = Depends(require_mod_legal)):
    empresa_path = os.path.join(TEMPLATES_DIR, empresa)
    if not os.path.exists(empresa_path):
        return []
    tipos = []
    for item in os.listdir(empresa_path):
        item_path = os.path.join(empresa_path, item)
        if (os.path.isfile(item_path) and item.endswith(".docx") and not item.startswith("~$")) or os.path.isdir(item_path):
            tipos.append(os.path.splitext(item)[0])
    return sorted(tipos)

@router.get("/metrics")
def get_metrics(db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_legal)):
    query = db.query(Contrato)
    if not current_user.es_admin and current_user.empresa_filtro:
        query = query.filter(Contrato.empresa == current_user.empresa_filtro)
    contracts = query.all()
    
    status_counts = {}
    type_counts = {}
    lawyer_counts = {}

    for step in FLOW_STEPS:
        status_counts[step] = 0

    for c in contracts:
        status_counts[c.estatus] = status_counts.get(c.estatus, 0) + 1
        type_counts[c.tipo_contrato] = type_counts.get(c.tipo_contrato, 0) + 1
        lawyer = c.responsable_interno or "Sin Asignar"
        lawyer_counts[lawyer] = lawyer_counts.get(lawyer, 0) + 1

    return {
        "status_data": [{"name": k, "value": v} for k, v in status_counts.items() if v > 0],
        "type_data": [{"name": k, "value": v} for k, v in type_counts.items()],
        "lawyer_data": [{"name": k, "value": v} for k, v in lawyer_counts.items()],
        "total_contracts": len(contracts)
    }
