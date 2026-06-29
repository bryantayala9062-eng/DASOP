from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile, Body, BackgroundTasks, Request
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse
from pathlib import Path

from core.database import get_db
from models.all_models import Empresa, DocumentoMaterialidad, Usuario, Contrato, ContratoCafi
from core.security import require_mod_materialidad, get_current_user
from core.backup import ejecutar_respaldo
from api.materialidad.logic import guardar_documento, BASE_DIR, actualizar_resultados_op_nulos
from api.materialidad.importar_carpeta import importar_lote
import threading

router = APIRouter(prefix="/api/materialidad", tags=["materialidad"])

@router.get("/resumen-global")
def resumen_global(db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_materialidad)):
    """Retorna todas las empresas con sus documentos para el mini-dashboard."""
    query = db.query(Empresa)
    if not current_user.es_admin and current_user.empresa_filtro:
        query = query.filter(Empresa.razon_social == current_user.empresa_filtro)
    empresas = query.order_by(Empresa.razon_social).all()
    docs = db.query(DocumentoMaterialidad).all()

    # Indexar docs por empresa
    from collections import defaultdict
    docs_por_empresa: dict = defaultdict(list)
    for d in docs:
        docs_por_empresa[d.empresa_id].append({
            "id": d.id,
            "tipo_documento": d.tipo_documento,
            "fecha_subida": d.fecha_subida.isoformat(),
            "periodo": d.periodo,
            "resultado_op": d.resultado_op,
        })

    DOC_TIPOS = [
        "CONTRATO_MARCO","ACTA_CONSTITUTIVA","OPINION_CUMPLIMIENTO",
        "CONSTANCIA_SITUACION","PODER_NOTARIAL","ESTADO_CUENTA",
        "DECLARACION_ANUAL","OTRO"
    ]

    result = []
    for e in empresas:
        emp_docs = docs_por_empresa.get(e.id, [])
        tipos_presentes = {d["tipo_documento"] for d in emp_docs}
        completados = len([t for t in DOC_TIPOS if t in tipos_presentes])
        pct = round((completados / len(DOC_TIPOS)) * 100)
        result.append({
            "id": e.id,
            "razon_social": e.razon_social,
            "rfc": e.rfc,
            "total_docs": len(emp_docs),
            "tipos_presentes": list(tipos_presentes),
            "completados": completados,
            "total_tipos": len(DOC_TIPOS),
            "pct": pct,
            "documentos": emp_docs,
        })
    return result

@router.get("/empresas")
def listar_empresas(db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_materialidad)):
    """Retorna todas las empresas registradas."""
    query = db.query(Empresa)
    if not current_user.es_admin and current_user.empresa_filtro:
        query = query.filter(Empresa.razon_social == current_user.empresa_filtro)
    empresas = query.order_by(Empresa.razon_social).all()
    return [
        {"id": e.id, "razon_social": e.razon_social, "rfc": e.rfc}
        for e in empresas
    ]

@router.post("/empresas")
def crear_empresa(razon_social: str = Form(...), rfc: str = Form(...), db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_materialidad)):
    """Crea una nueva empresa."""
    empresa = db.query(Empresa).filter(Empresa.rfc == rfc).first()
    if empresa:
        raise HTTPException(status_code=400, detail="RFC ya existe")
    
    nueva_empresa = Empresa(razon_social=razon_social, rfc=rfc)
    db.add(nueva_empresa)
    db.commit()
    db.refresh(nueva_empresa)
    return {"id": nueva_empresa.id, "razon_social": nueva_empresa.razon_social, "rfc": nueva_empresa.rfc}

@router.delete("/empresas/{empresa_id}")
def eliminar_empresa(empresa_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_materialidad)):
    """Elimina una empresa, sus documentos asociados (y archivos físicos) y desvincula sus contratos."""
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    
    # 1. Eliminar documentos asociados y sus archivos físicos
    documentos = db.query(DocumentoMaterialidad).filter(DocumentoMaterialidad.empresa_id == empresa_id).all()
    for doc in documentos:
        ruta = BASE_DIR / doc.ruta_fisica
        if ruta.exists():
            try:
                ruta.unlink()
            except Exception:
                pass # Ignorar si no se puede borrar el archivo físico
        db.delete(doc)
        
    # 2. Desvincular contratos en Seguimiento Legal
    contratos = db.query(Contrato).filter(Contrato.empresa_id == empresa_id).all()
    for contrato in contratos:
        contrato.empresa_id = None
        
    db.delete(empresa)
    db.commit()
    return {"success": True, "message": "Empresa eliminada exitosamente junto con sus documentos"}


# ──────────────────────────────────────────────
# PESTAÑA "POR VINCULAR" — debe ir ANTES de /documentos/{empresa_id}
# para que FastAPI no lo confunda con un empresa_id=str
# ──────────────────────────────────────────────
@router.get("/documentos/por-vincular")
def listar_documentos_por_vincular(db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_materialidad)):
    """Retorna los CONTRATO_MARCO sin vincular: contrato_id NULL o apunta a contrato inexistente."""
    from sqlalchemy import or_
    docs = (
        db.query(DocumentoMaterialidad)
        .outerjoin(Contrato, DocumentoMaterialidad.contrato_id == Contrato.id)
        .outerjoin(Empresa, DocumentoMaterialidad.empresa_id == Empresa.id)
    )
    if not current_user.es_admin and current_user.empresa_filtro:
        docs = docs.filter(Empresa.razon_social == current_user.empresa_filtro)
        
    docs = docs.filter(
            DocumentoMaterialidad.tipo_documento == "CONTRATO_MARCO",
            or_(
                DocumentoMaterialidad.contrato_id == None,
                Contrato.id == None,
            )
        ).order_by(DocumentoMaterialidad.fecha_subida.desc()).all()

    result = []
    for d in docs:
        empresa = db.query(Empresa).filter(Empresa.id == d.empresa_id).first()
        result.append({
            "id": d.id,
            "empresa_id": d.empresa_id,
            "razon_social": empresa.razon_social if empresa else "Empresa Desconocida",
            "fecha_subida": d.fecha_subida.isoformat(),
            "ruta_fisica": d.ruta_fisica,
        })

    return result


@router.post("/limpiar-fantasmas")
def limpiar_contrato_ids_fantasma(db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_materialidad)):
    """Limpia contrato_ids que apuntan a contratos ya eliminados. Deja el campo en NULL para re-vincular."""
    docs_con_id = db.query(DocumentoMaterialidad).filter(DocumentoMaterialidad.contrato_id != None).all()
    limpios = 0
    for d in docs_con_id:
        contrato = db.query(Contrato).filter(Contrato.id == d.contrato_id).first()
        if not contrato:
            d.contrato_id = None
            limpios += 1
    db.commit()
    return {"limpiados": limpios, "message": f"{limpios} referencia(s) fantasma eliminadas"}


@router.post("/sincronizar-pdfs")
def sincronizar_pdfs_materialidad_a_legal(db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_materialidad)):
    """Copia el archivo_path del PDF de Materialidad al Contrato en Legal para los que ya están vinculados pero el contrato aún no tiene archivo."""
    docs_vinculados = (
        db.query(DocumentoMaterialidad)
        .filter(
            DocumentoMaterialidad.contrato_id != None,
            DocumentoMaterialidad.tipo_documento == "CONTRATO_MARCO",
            DocumentoMaterialidad.ruta_fisica != None,
        )
        .all()
    )
    sincronizados = 0
    for d in docs_vinculados:
        contrato = db.query(Contrato).filter(Contrato.id == d.contrato_id).first()
        if contrato and not contrato.archivo_path and d.ruta_fisica:
            full_path = str(BASE_DIR / d.ruta_fisica)
            contrato.archivo_path = full_path
            sincronizados += 1
    db.commit()
    return {"sincronizados": sincronizados, "message": f"{sincronizados} contrato(s) actualizados con su PDF de Materialidad"}


@router.get("/documentos/{empresa_id}")
def listar_documentos(empresa_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_materialidad)):
    """Retorna los documentos de una empresa."""
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    documentos = (
        db.query(DocumentoMaterialidad)
        .filter(DocumentoMaterialidad.empresa_id == empresa_id)
        .order_by(DocumentoMaterialidad.fecha_subida.desc())
        .all()
    )
    return [
        {
            "id": d.id,
            "tipo_documento": d.tipo_documento,
            "fecha_subida": d.fecha_subida.isoformat(),
            "ruta_fisica": d.ruta_fisica,
            "resultado_op": d.resultado_op,
            "periodo": d.periodo,
            "razon_social": empresa.razon_social,
            "contrato_id": d.contrato_id,
            "cliente": d.contrato_rel.cliente if d.contrato_id and d.contrato_rel else None,
            "tipo_contrato": d.contrato_rel.tipo_contrato if d.contrato_id and d.contrato_rel else None,
        }
        for d in documentos
    ]

# Mapa legible de tipo → label para nombres de descarga
_TIPO_LABELS = {
    "CONTRATO_MARCO": "Contrato",
    "ACTA_CONSTITUTIVA": "Acta Constitutiva",
    "OPINION_CUMPLIMIENTO": "Opinion de Cumplimiento SAT",
    "CONSTANCIA_SITUACION": "Constancia de Situacion Fiscal",
    "PODER_NOTARIAL": "Poder Notarial",
    "ESTADO_CUENTA": "Estado de Cuenta",
    "DECLARACION_ANUAL": "Declaracion Anual ISR",
    "OTRO": "Documento",
}

def _nombre_descarga(tipo: str, razon_social: str) -> str:
    import re
    label = _TIPO_LABELS.get(tipo, tipo.replace("_", " ").title())
    empresa = re.sub(r"[^\w\s\-]", "", razon_social).strip()
    return f"{label} - {empresa}.pdf"

@router.post("/documentos/upload")
async def subir_documento(
    background_tasks: BackgroundTasks,
    archivo: UploadFile = File(...),
    empresa_id: int = Form(...),
    tipo_documento: str = Form(...),
    contrato_id: int | None = Form(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_materialidad)
):
    """Sube un PDF: lo guarda en disco y registra en BD."""
    if not archivo.filename or not archivo.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")

    resultado = await guardar_documento(archivo, empresa_id, tipo_documento, db, contrato_id=contrato_id)

    if not resultado["success"]:
        raise HTTPException(status_code=500, detail=resultado["message"])

    threading.Thread(target=ejecutar_respaldo, daemon=True).start()

    return resultado

@router.get("/documentos/download/{doc_id}")
def descargar_documento(doc_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """Descarga un PDF con nombre legible: Tipo - Empresa.pdf"""
    if not current_user.mod_materialidad and not current_user.es_admin and not current_user.mod_legal:
        raise HTTPException(status_code=403, detail="Sin acceso")
    doc = db.query(DocumentoMaterialidad).filter(DocumentoMaterialidad.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    empresa = db.query(Empresa).filter(Empresa.id == doc.empresa_id).first()
    ruta_archivo = BASE_DIR / doc.ruta_fisica

    if not ruta_archivo.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")

    nombre = _nombre_descarga(doc.tipo_documento, empresa.razon_social if empresa else "Empresa")
    return FileResponse(path=str(ruta_archivo), filename=nombre, media_type="application/pdf")

@router.get("/documentos/view/{doc_id}")
def ver_documento(
    doc_id: int,
    request: Request,
    token: str | None = None,   # para iframes (query param)
    db: Session = Depends(get_db),
):
    """
    Visualiza un PDF inline.
    Acepta autenticación por:
      - Header Authorization: Bearer <token>  (uso normal)
      - Query param ?token=<token>             (uso en iframes, que no pueden enviar headers)
    """
    from jose import JWTError, jwt
    from core.security import SECRET_KEY, ALGORITHM
    from models.all_models import Usuario

    # Validar token (query param tiene prioridad para iframes)
    raw_token = token
    if not raw_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            raw_token = auth_header.split(" ")[1]
            
    if not raw_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user or not user.activo:
        raise HTTPException(status_code=401, detail="Usuario inactivo")
    if not user.mod_materialidad and not user.es_admin and not user.mod_legal:
        raise HTTPException(status_code=403, detail="Sin acceso a Materialidad o Legal")

    doc = db.query(DocumentoMaterialidad).filter(DocumentoMaterialidad.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    ruta_archivo = BASE_DIR / doc.ruta_fisica
    if not ruta_archivo.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")

    return FileResponse(
        path=str(ruta_archivo),
        filename=ruta_archivo.name,
        media_type="application/pdf",
        content_disposition_type="inline"
    )

@router.get("/empresa-expediente")
def obtener_expediente_por_nombre(nombre: str, db: Session = Depends(get_db)):
    """Busca o crea una empresa por nombre (desde el dashboard) y retorna sus documentos."""
    nombre = nombre.strip()
    
    # 1. Búsqueda exacta (ignorando mayúsculas/minúsculas)
    empresa = db.query(Empresa).filter(Empresa.razon_social.ilike(nombre)).first()
    
    # 2. Si no hay match exacto, intentar búsqueda fuzzy para evitar duplicados por typos
    if not empresa:
        from difflib import SequenceMatcher
        todas = db.query(Empresa).all()
        nombre_upper = nombre.upper()
        mejor_match = None
        mejor_ratio = 0.0
        for e in todas:
            ratio = SequenceMatcher(None, nombre_upper, e.razon_social.upper()).ratio()
            if ratio > mejor_ratio:
                mejor_ratio = ratio
                mejor_match = e
        # Si hay un match con ≥80% de similitud, usar esa empresa
        if mejor_match and mejor_ratio >= 0.80:
            empresa = mejor_match
    
    # 3. Si definitivamente no existe, crearla auto (sin RFC por ahora)
    if not empresa:
        import hashlib
        hash_suffix = hashlib.md5(nombre.encode()).hexdigest()[:9].upper()
        empresa = Empresa(razon_social=nombre, rfc=f"XAXX{hash_suffix}")
        db.add(empresa)
        try:
            db.commit()
            db.refresh(empresa)
        except Exception:
            db.rollback()
    
    documentos = (
        db.query(DocumentoMaterialidad)
        .filter(DocumentoMaterialidad.empresa_id == empresa.id)
        .order_by(DocumentoMaterialidad.fecha_subida.desc())
        .all()
    )

    # Pre-cargar todos los contratos de esta empresa para evitar N+1 queries
    from models.all_models import Contrato
    contratos_empresa = (
        db.query(Contrato)
        .filter(Contrato.empresa_id == empresa.id)
        .all()
    )
    # Lista de clientes únicos de esta empresa en Seguimiento Legal
    clientes_empresa = list(dict.fromkeys(
        f"{c.cliente} ({c.tipo_contrato})" for c in contratos_empresa if c.cliente
    ))

    return {
        "empresa_id": empresa.id,
        "razon_social": empresa.razon_social,
        "rfc": empresa.rfc,
        "documentos": [
            {
                "id": d.id,
                "tipo_documento": d.tipo_documento,
                "fecha_subida": d.fecha_subida.isoformat(),
                "resultado_op": d.resultado_op,
                "periodo": d.periodo,
                # Si está vinculado a un contrato específico, usar ese cliente
                # Si no, devolver la lista de clientes de la empresa
                "cliente": d.contrato_rel.cliente if d.contrato_id and d.contrato_rel else None,
                "tipo_contrato": d.contrato_rel.tipo_contrato if d.contrato_id and d.contrato_rel else None,
                "clientes_empresa": clientes_empresa if not d.contrato_id else [],
            }
            for d in documentos
        ]
    }

# ──────────────────────────────────────────────
# NUEVO: Status rápido de la Opinión de Cumplimiento
# ──────────────────────────────────────────────
@router.get("/op-status")
def obtener_op_status(nombre: str, db: Session = Depends(get_db)):
    """
    Retorna el estado más reciente de la Opinión de Cumplimiento para
    una empresa buscada por nombre. Respuesta liviana para badges en UI.
    """
    nombre = nombre.strip()
    empresa = db.query(Empresa).filter(Empresa.razon_social.ilike(nombre)).first()

    if not empresa:
        return {"status": "SIN_DOCUMENTO", "fecha": None, "doc_id": None, "periodo": None}

    # Obtener la OP más reciente
    doc = (
        db.query(DocumentoMaterialidad)
        .filter(
            DocumentoMaterialidad.empresa_id == empresa.id,
            DocumentoMaterialidad.tipo_documento == "OPINION_CUMPLIMIENTO",
        )
        .order_by(DocumentoMaterialidad.fecha_subida.desc())
        .first()
    )

    if not doc:
        return {"status": "SIN_DOCUMENTO", "fecha": None, "doc_id": None, "periodo": None}

    status = doc.resultado_op if doc.resultado_op else "SIN_RESULTADO"
    return {
        "status": status,
        "fecha": doc.fecha_subida.isoformat(),
        "doc_id": doc.id,
        "periodo": doc.periodo,
    }

# ──────────────────────────────────────────────
# NUEVO: Importación masiva desde carpeta del servidor
# ──────────────────────────────────────────────
@router.post("/importar-lote")
def importar_lote_endpoint(
    carpeta_path: str = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    """
    Importa masivamente PDFs de CSF y OP desde una carpeta del servidor.
    Detecta automáticamente empresa, tipo y resultado_op desde el nombre del archivo.
    No requiere autenticación especial: cualquier usuario del sistema puede usarlo.
    """
    reporte = importar_lote(carpeta_path, db)
    return reporte

@router.post("/actualizar-resultados-op")
def actualizar_resultados_op_endpoint(db: Session = Depends(get_db)):
    """
    Lee los PDFs ya importados de tipo OPINION_CUMPLIMIENTO con resultado_op = NULL
    y los actualiza automáticamente. Útil para corregir importaciones anteriores
    sin necesidad de acceder físicamente al servidor.
    """
    reporte = actualizar_resultados_op_nulos(db)
    return reporte


# ──────────────────────────────────────────────
# Upload por nombre (existente, actualizado)
# ──────────────────────────────────────────────
@router.post("/documentos/upload-by-nombre")
async def subir_documento_por_nombre(
    archivo: UploadFile = File(...),
    empresa_nombre: str = Form(...),
    tipo_documento: str = Form(...),
    db: Session = Depends(get_db)
):
    """Permite subir un archivo solo sabiendo el nombre de la empresa (creándola si no existe)."""
    if not archivo.filename or not archivo.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")
        
    empresa_nombre = empresa_nombre.strip()
    empresa = db.query(Empresa).filter(Empresa.razon_social.ilike(empresa_nombre)).first()
    
    # Búsqueda fuzzy si no hay match exacto
    if not empresa:
        from difflib import SequenceMatcher
        todas = db.query(Empresa).all()
        nombre_upper = empresa_nombre.upper()
        mejor_match = None
        mejor_ratio = 0.0
        for e in todas:
            ratio = SequenceMatcher(None, nombre_upper, e.razon_social.upper()).ratio()
            if ratio > mejor_ratio:
                mejor_ratio = ratio
                mejor_match = e
        if mejor_match and mejor_ratio >= 0.80:
            empresa = mejor_match
    
    if not empresa:
        import hashlib
        hash_suffix = hashlib.md5(empresa_nombre.encode()).hexdigest()[:9].upper()
        empresa = Empresa(razon_social=empresa_nombre, rfc=f"XAXX{hash_suffix}")
        db.add(empresa)
        try:
            db.commit()
            db.refresh(empresa)
        except Exception:
            db.rollback()
        
    resultado = await guardar_documento(archivo, empresa.id, tipo_documento, db)

    if not resultado["success"]:
        raise HTTPException(status_code=500, detail=resultado["message"])

    return resultado


# ──────────────────────────────────────────────
# CORRECCIÓN DE TIPO: reasignar tipo_documento
# ──────────────────────────────────────────────
@router.patch("/documentos/{doc_id}/tipo")
def cambiar_tipo_documento(
    doc_id: int,
    nuevo_tipo: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_materialidad),
):
    """
    Cambia el tipo_documento de un documento ya subido.
    Útil para corregir errores como subir un Contrato como Acta Constitutiva.
    El archivo físico no se mueve, solo cambia el registro en BD.
    """
    doc = db.query(DocumentoMaterialidad).filter(DocumentoMaterialidad.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    tipos_validos = list(_TIPO_LABELS.keys())
    if nuevo_tipo not in tipos_validos:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Válidos: {tipos_validos}")

    tipo_anterior = doc.tipo_documento
    doc.tipo_documento = nuevo_tipo

    # Si ahora es OP, intentar detectar resultado_op si no lo tiene
    if nuevo_tipo == "OPINION_CUMPLIMIENTO" and not doc.resultado_op:
        from api.materialidad.logic import detectar_resultado_op_desde_ruta
        ruta = BASE_DIR / doc.ruta_fisica
        if ruta.exists():
            doc.resultado_op = detectar_resultado_op_desde_ruta(ruta)

    try:
        db.commit()
        db.refresh(doc)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar: {e}")

    return {
        "success": True,
        "doc_id": doc_id,
        "tipo_anterior": tipo_anterior,
        "tipo_nuevo": doc.tipo_documento,
    }


@router.delete("/documentos/{doc_id}")
def eliminar_documento(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_materialidad),
):
    """Elimina un documento de la BD y del disco."""
    doc = db.query(DocumentoMaterialidad).filter(DocumentoMaterialidad.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    ruta = BASE_DIR / doc.ruta_fisica
    db.delete(doc)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar: {e}")

    if ruta.exists():
        try:
            ruta.unlink()
        except Exception:
            pass  # Si no se puede borrar físicamente, no es crítico

    return {"success": True, "doc_id": doc_id}


@router.patch("/documentos/{doc_id}/vincular")
def vincular_documento(
    doc_id: int,
    contrato_id: int = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_materialidad),
):
    """Vincula un documento existente a un contrato de Seguimiento Legal."""
    doc = db.query(DocumentoMaterialidad).filter(DocumentoMaterialidad.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    contrato = db.query(Contrato).filter(Contrato.id == contrato_id).first()
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado en Legal")

    # Vinculación bilateral
    doc.contrato_id = contrato_id
    contrato.empresa_id = doc.empresa_id

    # Compartir el PDF: si el contrato no tiene archivo adjunto, apuntarlo al PDF de Materialidad
    if not contrato.archivo_path and doc.ruta_fisica:
        full_path = str(BASE_DIR / doc.ruta_fisica)
        contrato.archivo_path = full_path

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al vincular: {e}")

    return {"success": True, "message": "Vinculado correctamente"}


@router.patch("/documentos/{doc_id}/desvincular")
def desvincular_documento(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_materialidad),
):
    """Quita la relación entre un documento de Materialidad y su contrato de Seguimiento Legal."""
    doc = db.query(DocumentoMaterialidad).filter(DocumentoMaterialidad.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    if not doc.contrato_id:
        raise HTTPException(status_code=400, detail="El documento no tiene contrato vinculado")

    # Limpiar el archivo_path del contrato si apuntaba al PDF de materialidad
    contrato = db.query(Contrato).filter(Contrato.id == doc.contrato_id).first()
    if contrato and doc.ruta_fisica:
        full_path = str(BASE_DIR / doc.ruta_fisica)
        if contrato.archivo_path == full_path:
            contrato.archivo_path = None

    doc.contrato_id = None

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al desvincular: {e}")

    return {"success": True, "message": "Relación eliminada correctamente"}

# ==========================================
# MÓDULO: CAFI
# ==========================================
import shutil
import os
from datetime import datetime
from pydantic import BaseModel

CAFI_DIR = BASE_DIR / "uploads" / "materialidad" / "cafis"
CAFI_DIR.mkdir(parents=True, exist_ok=True)

@router.get("/cafis")
def listar_cafis(db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_materialidad)):
    query = db.query(ContratoCafi)
    if not current_user.es_admin and current_user.empresa_filtro:
        query = query.filter(ContratoCafi.emisora == current_user.empresa_filtro)
    cafis = query.order_by(ContratoCafi.fecha_subida.desc()).all()
    return [{
        "id": c.id,
        "emisora": c.emisora,
        "cliente": c.cliente,
        "fecha_creacion": c.fecha_creacion.isoformat() if c.fecha_creacion else None,
        "fecha_vencimiento": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None,
        "fecha_subida": c.fecha_subida.isoformat() if c.fecha_subida else None,
        "ruta_fisica": c.ruta_fisica,
        "ruta_notificacion": c.ruta_notificacion,
        "ruta_convenio": c.ruta_convenio,
        "ruta_mandato": c.ruta_mandato,
        "estatus_redaccion": c.estatus_redaccion or "pendiente",
        "estatus_notaria": c.estatus_notaria or "pendiente",
        "estatus_firma": c.estatus_firma or "pendiente",
    } for c in cafis]

@router.post("/cafis/upload")
def upload_cafi(
    archivo: UploadFile = File(...),
    emisora: str = Form(None),
    cliente: str = Form(None),
    fecha_creacion: str = Form(None),
    fecha_vencimiento: str = Form(None),
    cafi_id: int = Form(None),
    tipo_archivo: str = Form("contrato"),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_materialidad)
):
    if not archivo.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")

    safe_filename = f"CAFI_{tipo_archivo}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{archivo.filename}"
    file_path = CAFI_DIR / safe_filename
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(archivo.file, buffer)
        
    fc = None
    if fecha_creacion:
        try: fc = datetime.strptime(fecha_creacion, "%Y-%m-%d").date()
        except: pass
        
    fv = None
    if fecha_vencimiento:
        try: fv = datetime.strptime(fecha_vencimiento, "%Y-%m-%d").date()
        except: pass

    rel_path = str(file_path.relative_to(BASE_DIR)).replace("\\", "/")

    if cafi_id:
        cafi = db.query(ContratoCafi).filter(ContratoCafi.id == cafi_id).first()
        if not cafi:
            raise HTTPException(status_code=404, detail="Expediente CAFI no encontrado")
        
        if emisora: cafi.emisora = emisora
        if cliente: cafi.cliente = cliente
        if fc: cafi.fecha_creacion = fc
        if fv: cafi.fecha_vencimiento = fv
        
        if tipo_archivo == "notificacion":
            cafi.ruta_notificacion = rel_path
        elif tipo_archivo == "convenio":
            cafi.ruta_convenio = rel_path
        elif tipo_archivo == "mandato":
            cafi.ruta_mandato = rel_path
        else:
            cafi.ruta_fisica = rel_path
            
        db.commit()
        db.refresh(cafi)
        return {"message": "Archivo agregado al expediente CAFI", "id": cafi.id}
    else:
        cafi = ContratoCafi(
            emisora=emisora,
            cliente=cliente,
            fecha_creacion=fc,
            fecha_vencimiento=fv,
            ruta_fisica=rel_path if tipo_archivo == "contrato" else "",
            ruta_notificacion=rel_path if tipo_archivo == "notificacion" else None,
            ruta_convenio=rel_path if tipo_archivo == "convenio" else None,
            ruta_mandato=rel_path if tipo_archivo == "mandato" else None
        )
        db.add(cafi)
        db.commit()
        db.refresh(cafi)
        
        return {"message": "Expediente CAFI creado y archivo subido", "id": cafi.id}

@router.delete("/cafis/{id}")
def delete_cafi(id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_materialidad)):
    cafi = db.query(ContratoCafi).filter(ContratoCafi.id == id).first()
    if not cafi:
        raise HTTPException(status_code=404, detail="CAFI no encontrado")
        
    for ruta_str in [cafi.ruta_fisica, cafi.ruta_notificacion, cafi.ruta_convenio, cafi.ruta_mandato]:
        if ruta_str:
            ruta = BASE_DIR / ruta_str
            if ruta.exists():
                try:
                    ruta.unlink()
                except Exception:
                    pass
            
    db.delete(cafi)
    db.commit()
    return {"message": "CAFI eliminado exitosamente"}


@router.patch("/cafis/{id}/estatus")
def actualizar_estatus_cafi(
    id: int,
    campo: str = Body(...),
    valor: str = Body(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_mod_materialidad),
):
    """Actualiza un campo de estatus de materialidad (redaccion, notaria, firma) en un CAFI."""
    cafi = db.query(ContratoCafi).filter(ContratoCafi.id == id).first()
    if not cafi:
        raise HTTPException(status_code=404, detail="CAFI no encontrado")

    campos_validos = {"redaccion": "estatus_redaccion", "notaria": "estatus_notaria", "firma": "estatus_firma"}
    valores_validos = ["pendiente", "en_proceso", "completo"]

    if campo not in campos_validos:
        raise HTTPException(status_code=400, detail=f"Campo inválido. Válidos: {list(campos_validos.keys())}")
    if valor not in valores_validos:
        raise HTTPException(status_code=400, detail=f"Valor inválido. Válidos: {valores_validos}")

    setattr(cafi, campos_validos[campo], valor)
    db.commit()
    db.refresh(cafi)

    return {
        "success": True,
        "id": cafi.id,
        "campo": campo,
        "valor": valor,
        "estatus_redaccion": cafi.estatus_redaccion or "pendiente",
        "estatus_notaria": cafi.estatus_notaria or "pendiente",
        "estatus_firma": cafi.estatus_firma or "pendiente",
    }


@router.get("/cafis/{id}/view")
def view_cafi(id: int, request: Request, tipo: str = "contrato", token: str | None = None, db: Session = Depends(get_db)):
    from fastapi.responses import FileResponse
    from jose import JWTError, jwt
    from core.security import SECRET_KEY, ALGORITHM
    from models.all_models import Usuario

    # Validar token
    raw_token = token
    if not raw_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            raw_token = auth_header.split(" ")[1]
            
    if not raw_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user or not user.activo:
        raise HTTPException(status_code=401, detail="Usuario inactivo")
    if not user.mod_materialidad and not user.es_admin and not user.mod_legal:
        raise HTTPException(status_code=403, detail="Sin acceso a Materialidad o Legal")

    cafi = db.query(ContratoCafi).filter(ContratoCafi.id == id).first()
    if not cafi:
        raise HTTPException(status_code=404, detail="CAFI no encontrado")
        
    ruta = cafi.ruta_fisica
    if tipo == "notificacion":
        ruta = cafi.ruta_notificacion
    elif tipo == "convenio":
        ruta = cafi.ruta_convenio
    elif tipo == "mandato":
        ruta = cafi.ruta_mandato
        
    if not ruta:
        raise HTTPException(status_code=404, detail="El archivo solicitado no ha sido subido para este expediente")
        
    ruta_archivo = BASE_DIR / ruta
    if not ruta_archivo.exists():
        raise HTTPException(status_code=404, detail="Archivo fisico no encontrado")
        
    return FileResponse(
        path=str(ruta_archivo),
        filename=ruta_archivo.name,
        media_type="application/pdf",
        content_disposition_type="inline"
    )

@router.get("/clientes-unicos")
def get_clientes_unicos(db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_materialidad)):
    clientes_contrato = db.query(Contrato.cliente).filter(Contrato.cliente.isnot(None)).distinct().all()
    clientes_cafi = db.query(ContratoCafi.cliente).filter(ContratoCafi.cliente.isnot(None)).distinct().all()
    
    todos = [c[0].strip() for c in clientes_contrato if c[0] and c[0].strip()] + \
            [c[0].strip() for c in clientes_cafi if c[0] and c[0].strip()]
            
    return sorted(list(set(todos)))