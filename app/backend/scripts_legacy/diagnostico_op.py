"""
diagnostico_op.py
─────────────────
Muestra exactamente qué texto extrae pdfplumber de los primeros 3
documentos de tipo OPINION_CUMPLIMIENTO que tienen resultado_op = NULL.

Ejecutar desde la carpeta backend/:
    python diagnostico_op.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from core.database import SessionLocal
from models.all_models import DocumentoMaterialidad

BASE_DIR = Path(__file__).resolve().parent

try:
    import pdfplumber
except ImportError:
    print("❌ pdfplumber no instalado. Ejecuta: pip install pdfplumber")
    sys.exit(1)


def main():
    db = SessionLocal()
    try:
        docs = (
            db.query(DocumentoMaterialidad)
            .filter(
                DocumentoMaterialidad.tipo_documento == "OPINION_CUMPLIMIENTO",
                DocumentoMaterialidad.resultado_op.is_(None),
            )
            .limit(5)
            .all()
        )

        if not docs:
            print("✅ No hay OPs con resultado_op = NULL.")
            return

        print(f"📋 Analizando {len(docs)} documento(s) sin resultado_op:\n")

        for doc in docs:
            ruta = BASE_DIR / doc.ruta_fisica
            print(f"{'─'*60}")
            print(f"ID:     {doc.id}")
            print(f"Ruta:   {doc.ruta_fisica}")
            print(f"Existe: {ruta.exists()}")

            if not ruta.exists():
                print("❌ Archivo no encontrado en disco\n")
                continue

            print(f"Tamaño: {ruta.stat().st_size} bytes")

            try:
                with pdfplumber.open(str(ruta)) as pdf:
                    print(f"Páginas: {len(pdf.pages)}")
                    for i, page in enumerate(pdf.pages[:3]):
                        texto = page.extract_text()
                        print(f"\n  ── Página {i+1} ──")
                        if texto:
                            # Mostrar primeros 500 chars
                            preview = texto[:500].replace('\n', ' | ')
                            print(f"  TEXTO: {preview}")
                            print(f"  ¿Contiene POSITIVA? {'SÍ ✅' if 'POSITIVA' in texto.upper() else 'NO ❌'}")
                            print(f"  ¿Contiene NEGATIVA? {'SÍ ✅' if 'NEGATIVA' in texto.upper() else 'NO ❌'}")
                        else:
                            print("  ⚠️  Página SIN TEXTO EXTRAÍBLE (puede ser imagen/escaneado)")
            except Exception as e:
                print(f"❌ Error al abrir PDF: {e}")

            print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
