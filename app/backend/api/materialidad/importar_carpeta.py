"""
importar_carpeta.py
───────────────────
Lógica para importar masivamente PDFs de CSF y OP desde una carpeta del
servidor. Se usa desde el endpoint POST /api/materialidad/importar-lote.

Reglas de negocio:
  - Se escanean todos los .pdf de la carpeta indicada (no recursivo).
  - El tipo de documento (CSF / OP) se infiere del nombre del archivo.
  - El resultado de la OP (POSITIVA / NEGATIVA) se detecta:
      1. Primero desde el nombre del archivo.
      2. Si no está en el nombre, se lee el contenido del PDF (pdfplumber).
  - Si la empresa no existe en BD, se crea automáticamente.
  - Si ya existe un documento del mismo tipo para esa empresa, se
    guarda el nuevo y el sistema siempre mostrará el más reciente.
"""

import hashlib
from pathlib import Path

from sqlalchemy.orm import Session

from models.all_models import Empresa
from api.materialidad.logic import (
    parsear_nombre_archivo,
    guardar_documento_desde_ruta,
    actualizar_resultados_op_nulos,
)


def _obtener_o_crear_empresa(nombre: str, db: Session) -> Empresa:
    """
    Busca la empresa por razón social (case-insensitive, title-case y upper).
    Si no existe, la crea con un RFC temporal basado en hash del nombre.
    """
    # Intentar en Title Case
    empresa = db.query(Empresa).filter(Empresa.razon_social.ilike(nombre)).first()
    if empresa:
        return empresa

    # Intentar upper
    empresa = db.query(Empresa).filter(Empresa.razon_social.ilike(nombre.upper())).first()
    if empresa:
        return empresa

    # Crear nueva empresa con RFC temporal
    hash_suffix = hashlib.md5(nombre.encode()).hexdigest()[:9].upper()
    nueva = Empresa(
        razon_social=nombre.upper(),
        rfc=f"XAXX{hash_suffix}",
    )
    db.add(nueva)
    try:
        db.commit()
        db.refresh(nueva)
    except Exception:
        db.rollback()
        # Por si hay race condition o duplicado, intentar buscar de nuevo
        nueva = db.query(Empresa).filter(Empresa.razon_social.ilike(nombre)).first()
    return nueva


def importar_lote(carpeta_path: str, db: Session) -> dict:
    """
    Escanea la carpeta indicada e importa todos los PDFs encontrados.

    Retorna un diccionario con:
      {
        "total_archivos": int,
        "importados": int,
        "errores": int,
        "sin_tipo_detectado": int,
        "detalle": [ { "archivo": str, "resultado": str, "tipo": str, "empresa": str, "op": str } ]
      }
    """
    carpeta = Path(carpeta_path)

    if not carpeta.exists():
        return {
            "total_archivos": 0,
            "importados": 0,
            "errores": 1,
            "sin_tipo_detectado": 0,
            "detalle": [{"archivo": "—", "resultado": f"❌ Carpeta no encontrada: {carpeta_path}"}],
        }

    pdfs = sorted(carpeta.glob("*.pdf"))

    total = len(pdfs)
    importados = 0
    errores = 0
    sin_tipo = 0
    detalle = []

    for pdf_path in pdfs:
        info = parsear_nombre_archivo(pdf_path.name)

        empresa_nombre = info.get("empresa_nombre")
        tipo_doc = info.get("tipo_documento")
        resultado_op = info.get("resultado_op")
        periodo = info.get("periodo")

        # Si no se pudo detectar tipo, saltar
        if not tipo_doc or not empresa_nombre:
            sin_tipo += 1
            detalle.append({
                "archivo": pdf_path.name,
                "resultado": "⚠️ No se pudo detectar tipo o empresa",
                "tipo": tipo_doc or "—",
                "empresa": empresa_nombre or "—",
                "op": "—",
            })
            continue

        try:
            empresa = _obtener_o_crear_empresa(empresa_nombre, db)

            res = guardar_documento_desde_ruta(
                ruta_fisica_origen=pdf_path,
                empresa_id=empresa.id,
                tipo_doc=tipo_doc,
                db=db,
                resultado_op=resultado_op,
                periodo=periodo,
            )

            if res["success"]:
                importados += 1
                # Usar el resultado_op REAL (puede haber sido detectado del PDF)
                op_real = res.get("resultado_op") or "—"
                detalle.append({
                    "archivo": pdf_path.name,
                    "resultado": "✅ Importado",
                    "tipo": tipo_doc,
                    "empresa": empresa.razon_social,
                    "op": op_real,
                })
            else:
                errores += 1
                detalle.append({
                    "archivo": pdf_path.name,
                    "resultado": res.get("mensaje", "❌ Error desconocido"),
                    "tipo": tipo_doc,
                    "empresa": empresa.razon_social,
                    "op": resultado_op or "—",
                })

        except Exception as e:
            errores += 1
            detalle.append({
                "archivo": pdf_path.name,
                "resultado": f"❌ Excepción: {e}",
                "tipo": tipo_doc or "—",
                "empresa": empresa_nombre or "—",
                "op": "—",
            })

    # ── Paso final: corregir cualquier OP que quedó sin resultado_op ──────────
    # Esto ocurre cuando pdfplumber necesita leer el PDF (nombre sin POSITIVA/NEGATIVA).
    # Se ejecuta automáticamente, sin intervención manual.
    actualizacion = actualizar_resultados_op_nulos(db)

    return {
        "total_archivos": total,
        "importados": importados,
        "errores": errores,
        "sin_tipo_detectado": sin_tipo,
        "op_actualizadas": actualizacion["actualizados"],
        "op_sin_resultado": actualizacion["sin_resultado"],
        "detalle": detalle,
    }
