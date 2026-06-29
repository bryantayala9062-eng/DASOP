import io
import os
import re
from datetime import datetime
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from models.all_models import DocumentoMaterialidad, Contrato

try:
    import pdfplumber
    _PDFPLUMBER_OK = True
except ImportError:
    _PDFPLUMBER_OK = False

# ──────────────────────────────────────────────
# CONFIGURACIÓN
# ──────────────────────────────────────────────
# Carpeta relativa al directorio raíz del proyecto backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent
CARPETA_DESTINO = BASE_DIR / "archivos_fisicos"

# Meses en español para detección de periodo
MESES_ES = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
]

# ──────────────────────────────────────────────
# UTILIDADES
# ──────────────────────────────────────────────
def _nombre_seguro(texto: str) -> str:
    texto = texto.strip().replace(" ", "_")
    return re.sub(r"[^\w\-]", "", texto, flags=re.ASCII)

def _generar_nombre_archivo(empresa_id: int, tipo_doc: str) -> str:
    fecha = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    tipo_limpio = _nombre_seguro(tipo_doc).upper()
    return f"{empresa_id}-{tipo_limpio}-{fecha}.pdf"


def _extraer_resultado_op_de_texto(texto: str) -> str | None:
    """
    Busca el Sentido de la opinión en el texto extraído del PDF.
    El SAT usa la columna 'Sentido' con valores 'POSITIVO' o 'NEGATIVO'
    (forma masculina). También acepta 'POSITIVA'/'NEGATIVA' por si acaso.
    Normaliza siempre a 'POSITIVA' / 'NEGATIVA' para almacenamiento.
    """
    texto_upper = texto.upper()
    # Detectar POSITIVO o POSITIVA
    if "POSITIVO" in texto_upper or "POSITIVA" in texto_upper:
        return "POSITIVA"
    # Detectar NEGATIVO o NEGATIVA
    if "NEGATIVO" in texto_upper or "NEGATIVA" in texto_upper:
        return "NEGATIVA"
    return None


def detectar_resultado_op(nombre_archivo: str) -> str | None:
    """
    Lee el nombre del PDF y detecta si la Opinión de Cumplimiento es
    POSITIVA o NEGATIVA. Devuelve None si no se puede determinar.
    Solo usa el nombre — sin leer el PDF (para uso con UploadFile).
    """
    nombre_upper = nombre_archivo.upper()
    if "POSITIVA" in nombre_upper:
        return "POSITIVA"
    if "NEGATIVA" in nombre_upper:
        return "NEGATIVA"
    return None


def detectar_resultado_op_desde_bytes(contenido: bytes, nombre_archivo: str = "") -> str | None:
    """
    Detecta POSITIVA/NEGATIVA:
    1. Primero por nombre del archivo.
    2. Si no, lee el contenido del PDF con pdfplumber.
    """
    # Paso 1: nombre del archivo
    resultado = detectar_resultado_op(nombre_archivo)
    if resultado:
        return resultado

    # Paso 2: leer texto del PDF
    if not _PDFPLUMBER_OK:
        return None
    try:
        with pdfplumber.open(io.BytesIO(contenido)) as pdf:
            # La OP del SAT normalmente tiene el resultado en la primera página
            for page in pdf.pages[:3]:
                texto = page.extract_text() or ""
                resultado = _extraer_resultado_op_de_texto(texto)
                if resultado:
                    return resultado
    except Exception:
        pass
    return None


def detectar_resultado_op_desde_ruta(ruta: Path, nombre_archivo: str = "") -> str | None:
    """
    Detecta POSITIVA/NEGATIVA desde una ruta de archivo físico.
    1. Primero por nombre del archivo.
    2. Si no, lee el PDF.
    """
    # Paso 1: nombre
    resultado = detectar_resultado_op(nombre_archivo or ruta.name)
    if resultado:
        return resultado

    # Paso 2: leer texto del PDF
    if not _PDFPLUMBER_OK or not ruta.exists():
        return None
    try:
        with pdfplumber.open(str(ruta)) as pdf:
            for page in pdf.pages[:3]:
                texto = page.extract_text() or ""
                resultado = _extraer_resultado_op_de_texto(texto)
                if resultado:
                    return resultado
    except Exception:
        pass
    return None


def detectar_periodo(nombre_archivo: str) -> str | None:
    """
    Detecta el periodo (mes + año) desde el nombre del archivo.
    Ej: "OP ABRIL 2026" → "ABRIL 2026"
    """
    nombre_upper = nombre_archivo.upper()
    for mes in MESES_ES:
        patron = rf"\b({mes})\s+(20\d{{2}})\b"
        m = re.search(patron, nombre_upper)
        if m:
            return f"{m.group(1)} {m.group(2)}"
    return None


def parsear_nombre_archivo(nombre_archivo: str) -> dict:
    """
    Infiere empresa, tipo_documento, resultado_op y periodo desde el
    nombre de un archivo PDF.

    Patrones esperados:
      EMPRESA CSF ABRIL 2026.pdf
      EMPRESA OP ABRIL 2026.pdf
      EMPRESA OP ABRIL 2026- POSITIVA.pdf
      EMPRESA OP ABRIL 2026- NEGATIVA.pdf

    Retorna un dict con:
      {
        "empresa_nombre": str | None,
        "tipo_documento": "CONSTANCIA_SITUACION" | "OPINION_CUMPLIMIENTO" | None,
        "resultado_op": "POSITIVA" | "NEGATIVA" | None,
        "periodo": "ABRIL 2026" | None,
      }
    """
    # Quitar extensión
    nombre = Path(nombre_archivo).stem.upper()

    resultado = {
        "empresa_nombre": None,
        "tipo_documento": None,
        "resultado_op": None,
        "periodo": None,
    }

    # Detectar tipo y posición del delimitador
    tipo_doc = None
    split_idx = -1

    # Buscar " OP " o terminar en " OP " (con posibles sufijos)
    m_op = re.search(r"\bOP\b", nombre)
    m_csf = re.search(r"\bCSF\b", nombre)

    if m_op:
        tipo_doc = "OPINION_CUMPLIMIENTO"
        split_idx = m_op.start()
    elif m_csf:
        tipo_doc = "CONSTANCIA_SITUACION"
        split_idx = m_csf.start()

    resultado["tipo_documento"] = tipo_doc

    if split_idx > 0:
        empresa_raw = nombre[:split_idx].strip().rstrip("- ").strip()
        # Convertir a Title Case para comparar con BD
        resultado["empresa_nombre"] = empresa_raw.title()

    # Detectar POSITIVA / NEGATIVA
    if tipo_doc == "OPINION_CUMPLIMIENTO":
        resultado["resultado_op"] = detectar_resultado_op(nombre)

    # Detectar periodo
    resultado["periodo"] = detectar_periodo(nombre)

    return resultado


# ──────────────────────────────────────────────
# FUNCIÓN PRINCIPAL DE GUARDADO
# ──────────────────────────────────────────────
async def guardar_documento(
    archivo_pdf: UploadFile,
    empresa_id: int,
    tipo_doc: str,
    db: Session,
    resultado_op: str | None = None,
    periodo: str | None = None,
    contrato_id: int | None = None,
) -> dict:
    """
    Guarda un PDF en disco y registra en BD.
    Si tipo_doc == 'OPINION_CUMPLIMIENTO', detecta automáticamente
    resultado_op desde el nombre y/o contenido del archivo.
    """
    try:
        # 1. Asegurar carpeta
        CARPETA_DESTINO.mkdir(parents=True, exist_ok=True)

        # 2. Nombre seguro
        nombre_archivo = _generar_nombre_archivo(empresa_id, tipo_doc)
        ruta_absoluta = CARPETA_DESTINO / nombre_archivo

        # 3. Leer contenido del archivo
        contenido = await archivo_pdf.read()

        # 4. Auto-detectar resultado_op y periodo:
        if tipo_doc == "OPINION_CUMPLIMIENTO" and resultado_op is None:
            resultado_op = detectar_resultado_op_desde_bytes(
                contenido,
                nombre_archivo=archivo_pdf.filename or "",
            )
            
        if periodo is None and archivo_pdf.filename:
            periodo = detectar_periodo(archivo_pdf.filename)

        # 5. Guardado físico
        with open(ruta_absoluta, "wb") as f:
            f.write(contenido)

        # 6. Ruta relativa para BD
        ruta_relativa = f"archivos_fisicos/{nombre_archivo}"

        # 6.5 Evitar duplicados (Misma empresa, mismo tipo y mismo periodo)
        if tipo_doc in ["OPINION_CUMPLIMIENTO", "CONSTANCIA_SITUACION"]:
            # Buscar si ya existe uno igual
            query_dup = db.query(DocumentoMaterialidad).filter(
                DocumentoMaterialidad.empresa_id == empresa_id,
                DocumentoMaterialidad.tipo_documento == tipo_doc
            )
            if periodo:
                query_dup = query_dup.filter(DocumentoMaterialidad.periodo == periodo)
            else:
                query_dup = query_dup.filter(DocumentoMaterialidad.periodo.is_(None))
                
            duplicados = query_dup.all()
            for dup in duplicados:
                # Borrar archivo físico viejo
                ruta_vieja = BASE_DIR / dup.ruta_fisica
                if ruta_vieja.exists():
                    try:
                        ruta_vieja.unlink()
                    except:
                        pass
                # Borrar de BD
                db.delete(dup)
            
            if duplicados:
                db.commit()

        # 7. Registro en BD
        try:
            nuevo_doc = DocumentoMaterialidad(
                empresa_id=empresa_id,
                contrato_id=contrato_id,
                tipo_documento=tipo_doc,
                ruta_fisica=ruta_relativa,
                resultado_op=resultado_op,
                periodo=periodo,
            )
            db.add(nuevo_doc)
            
            # 8. Vincular con Seguimiento Legal si aplica
            if contrato_id:
                contrato_legal = db.query(Contrato).filter(Contrato.id == contrato_id).first()
                if contrato_legal:
                    contrato_legal.empresa_id = empresa_id
            
            db.commit()
            db.refresh(nuevo_doc)
            return {
                "success": True,
                "message": f"Documento guardado: {ruta_relativa}",
                "documento_id": nuevo_doc.id,
                "resultado_op": resultado_op,
                "periodo": periodo,
            }
        except Exception as e_db:
            db.rollback()
            if ruta_absoluta.exists():
                ruta_absoluta.unlink()
            return {"success": False, "message": f"Error en BD: {e_db}"}

    except Exception as e:
        return {"success": False, "message": f"Error general: {e}"}


def guardar_documento_desde_ruta(
    ruta_fisica_origen: Path,
    empresa_id: int,
    tipo_doc: str,
    db: Session,
    resultado_op: str | None = None,
    periodo: str | None = None,
) -> dict:
    """
    Versión síncrona de guardar_documento para importación masiva.
    Copia el archivo desde su ruta original al directorio de archivos_fisicos.
    Lee el PDF para detectar POSITIVA/NEGATIVA si no viene en el nombre.
    """
    try:
        import shutil

        CARPETA_DESTINO.mkdir(parents=True, exist_ok=True)

        nombre_archivo = _generar_nombre_archivo(empresa_id, tipo_doc)
        ruta_absoluta = CARPETA_DESTINO / nombre_archivo

        # Detectar resultado_op leyendo el PDF si no viene del nombre
        if tipo_doc == "OPINION_CUMPLIMIENTO" and resultado_op is None:
            resultado_op = detectar_resultado_op_desde_ruta(ruta_fisica_origen)

        # Evitar duplicados de documentos (Misma empresa, mismo tipo y mismo periodo)
        if tipo_doc in ["OPINION_CUMPLIMIENTO", "CONSTANCIA_SITUACION"]:
            query_dup = db.query(DocumentoMaterialidad).filter(
                DocumentoMaterialidad.empresa_id == empresa_id,
                DocumentoMaterialidad.tipo_documento == tipo_doc
            )
            if periodo:
                query_dup = query_dup.filter(DocumentoMaterialidad.periodo == periodo)
            else:
                query_dup = query_dup.filter(DocumentoMaterialidad.periodo.is_(None))
                
            for dup in query_dup.all():
                ruta_vieja = BASE_DIR / dup.ruta_fisica
                if ruta_vieja.exists():
                    try:
                        ruta_vieja.unlink()
                    except:
                        pass
                db.delete(dup)
            db.commit()

        shutil.copy2(ruta_fisica_origen, ruta_absoluta)

        ruta_relativa = f"archivos_fisicos/{nombre_archivo}"

        nuevo_doc = DocumentoMaterialidad(
            empresa_id=empresa_id,
            tipo_documento=tipo_doc,
            ruta_fisica=ruta_relativa,
            resultado_op=resultado_op,
            periodo=periodo,
        )
        db.add(nuevo_doc)
        db.commit()
        db.refresh(nuevo_doc)
        return {
            "success": True,
            "mensaje": f"✅ {ruta_fisica_origen.name}",
            "documento_id": nuevo_doc.id,
            "resultado_op": resultado_op,
        }
    except Exception as e:
        db.rollback()
        return {"success": False, "mensaje": f"❌ {ruta_fisica_origen.name}: {e}"}


# ──────────────────────────────────────────────
# ACTUALIZACIÓN AUTOMÁTICA DE RESULTADOS NULL
# ──────────────────────────────────────────────
def actualizar_resultados_op_nulos(db: Session) -> dict:
    """
    Busca todos los documentos de tipo OPINION_CUMPLIMIENTO con
    resultado_op = NULL y los actualiza leyendo el PDF del disco.

    Se llama automáticamente al finalizar importar_lote() y también
    está disponible como endpoint independiente.

    Retorna:
      { "actualizados": int, "sin_resultado": int, "errores": int }
    """
    pendientes = (
        db.query(DocumentoMaterialidad)
        .filter(
            DocumentoMaterialidad.tipo_documento == "OPINION_CUMPLIMIENTO",
            DocumentoMaterialidad.resultado_op.is_(None),
        )
        .all()
    )

    actualizados = 0
    sin_resultado = 0
    errores = 0

    for doc in pendientes:
        ruta = BASE_DIR / doc.ruta_fisica
        if not ruta.exists():
            errores += 1
            continue

        resultado = detectar_resultado_op_desde_ruta(ruta)
        if resultado:
            doc.resultado_op = resultado
            actualizados += 1
        else:
            sin_resultado += 1

    try:
        db.commit()
    except Exception:
        db.rollback()
        errores += len(pendientes)
        actualizados = 0
        sin_resultado = 0

    return {
        "actualizados": actualizados,
        "sin_resultado": sin_resultado,
        "errores": errores,
        "total_procesados": len(pendientes),
    }
