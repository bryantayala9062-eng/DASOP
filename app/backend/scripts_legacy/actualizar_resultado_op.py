"""
actualizar_resultado_op.py
──────────────────────────
Script de actualización: lee los PDFs ya importados de tipo
OPINION_CUMPLIMIENTO que tienen resultado_op = NULL y los actualiza
leyendo el contenido del archivo físico con pdfplumber.

Ejecutar desde la carpeta backend/:
    python actualizar_resultado_op.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from core.database import SessionLocal
from models.all_models import DocumentoMaterialidad

try:
    import pdfplumber
    PDFPLUMBER_OK = True
except ImportError:
    print("❌ pdfplumber no está instalado. Ejecuta: pip install pdfplumber")
    sys.exit(1)

BASE_DIR = Path(__file__).resolve().parent


def detectar_desde_pdf(ruta: Path) -> str | None:
    try:
        with pdfplumber.open(str(ruta)) as pdf:
            for page in pdf.pages[:3]:
                texto = (page.extract_text() or "").upper()
                if "POSITIVA" in texto:
                    return "POSITIVA"
                if "NEGATIVA" in texto:
                    return "NEGATIVA"
    except Exception as e:
        print(f"  ⚠️  Error leyendo {ruta.name}: {e}")
    return None


def main():
    db = SessionLocal()
    try:
        # Buscar todas las OPs sin resultado_op
        pendientes = (
            db.query(DocumentoMaterialidad)
            .filter(
                DocumentoMaterialidad.tipo_documento == "OPINION_CUMPLIMIENTO",
                DocumentoMaterialidad.resultado_op.is_(None),
            )
            .all()
        )

        print(f"📋 Registros de OP sin resultado_op: {len(pendientes)}")

        if not pendientes:
            print("✅ No hay registros que actualizar. Todo está correcto.")
            return

        actualizados = 0
        sin_resultado = 0
        errores = 0

        for doc in pendientes:
            ruta = BASE_DIR / doc.ruta_fisica
            if not ruta.exists():
                print(f"  ⚠️  Archivo no encontrado en disco: {doc.ruta_fisica}")
                errores += 1
                continue

            resultado = detectar_desde_pdf(ruta)

            if resultado:
                doc.resultado_op = resultado
                actualizados += 1
                print(f"  ✅ ID {doc.id} → {resultado} (empresa_id={doc.empresa_id})")
            else:
                sin_resultado += 1
                print(f"  ⚪ ID {doc.id} → No detectado (empresa_id={doc.empresa_id})")

        db.commit()

        print(f"\n{'─'*50}")
        print(f"✅ Actualizados:    {actualizados}")
        print(f"⚪ Sin resultado:   {sin_resultado}")
        print(f"❌ Errores:         {errores}")
        print(f"Total procesados:  {len(pendientes)}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
