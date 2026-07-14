import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import SessionLocal
from models.all_models import KPIEvaluation, Evidence

def main():
    db = SessionLocal()
    try:
        # Buscar la evaluacion de Contabilidad para el mes 7 del año 2026
        evals = db.query(KPIEvaluation).filter(
            KPIEvaluation.department == "Contabilidad",
            KPIEvaluation.period_month == 7,
            KPIEvaluation.period_year == 2026
        ).all()
        
        for evaluation in evals:
            print(f"Borrando evaluacion ID {evaluation.id}")
            evidences = db.query(Evidence).filter(Evidence.kpi_eval_id == evaluation.id).all()
            for ev in evidences:
                if ev.file_path and os.path.exists(ev.file_path):
                    try:
                        os.remove(ev.file_path)
                        print(f"Archivo eliminado: {ev.file_path}")
                    except Exception as e:
                        print(f"No se pudo eliminar el archivo físico: {e}")
                db.delete(ev)
            db.delete(evaluation)
            
        db.commit()
        print("Eliminado con exito.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
