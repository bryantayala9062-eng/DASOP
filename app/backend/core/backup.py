import os
import shutil
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Base directories
# Este archivo está en app/backend/core/backup.py, así que PROJECT_ROOT es app/
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKUP_DIR = r"C:\Users\Administrador\Desktop\Respaldo_ERP_Actual"

import threading

_backup_lock = threading.Lock()

def ejecutar_respaldo():
    """
    Sincroniza las bases de datos y los archivos al directorio de respaldo en el escritorio.
    Se ejecuta de forma sincrónica, pero se llama desde un BackgroundTask para no bloquear la respuesta HTTP.
    """
    if not _backup_lock.acquire(blocking=False):
        logger.info("Un respaldo ya está en curso, omitiendo ejecución concurrente.")
        return

    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        
        # 1. Respaldar SQLite
        sqlite_src = os.path.join(PROJECT_ROOT, "backend", "portal_erp.db")
        if os.path.exists(sqlite_src):
            shutil.copy2(sqlite_src, os.path.join(BACKUP_DIR, "portal_erp.db"))
            
        # 2. Respaldar Excel madre
        excel_src = os.path.join(PROJECT_ROOT, "Bases_de_Datos", "dashboard_xml", "BaseDatosFACTURASoptimal.xlsx")
        if os.path.exists(excel_src):
            shutil.copy2(excel_src, os.path.join(BACKUP_DIR, "BaseDatosFACTURASoptimal.xlsx"))
            
        import sqlite3
        import re

        def clean_folder_name(name):
            if not name:
                return "DESCONOCIDA"
            return re.sub(r'[\\/*?:"<>|]', "", str(name)).strip()

        def abbreviate_name(name: str, max_words=3) -> str:
            if not name:
                return "DESCONOCIDO"
            name = re.sub(r'(?i)\b(S\.?A\.?\s*DE\s*C\.?V\.?|S\.?A\.?P\.?I\.?\s*DE\s*C\.?V\.?|S\.?A\.?|S\.?C\.?)\b', '', name).strip()
            words = [w for w in re.split(r'[\s\.\,]+', name) if w]
            return "_".join(words[:max_words]).upper()

        # Connect to SQLite to get mapping
        db_path = os.path.join(PROJECT_ROOT, "backend", "portal_erp.db")
        if os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path)
                c = conn.cursor()

                # 3. Respaldar Materialidad organizadamente
                c.execute('''
                    SELECT d.ruta_fisica, d.tipo_documento, e.razon_social 
                    FROM documentos_materialidad d 
                    JOIN empresas e ON d.empresa_id = e.id
                ''')
                for row in c.fetchall():
                    ruta_fisica, tipo_doc, empresa = row
                    if not ruta_fisica: continue
                    
                    src_path = os.path.join(PROJECT_ROOT, "backend", ruta_fisica.replace('/', os.sep))
                    if os.path.exists(src_path):
                        empresa_clean = clean_folder_name(empresa)
                        
                        # Fix folder mapping
                        if "CONTRATO" in tipo_doc.upper():
                            tipo_clean = "CONTRATOS"
                        else:
                            tipo_clean = clean_folder_name(tipo_doc)
                            
                        dest_folder = os.path.join(BACKUP_DIR, empresa_clean, tipo_clean)
                        os.makedirs(dest_folder, exist_ok=True)
                        
                        # Rename file logically
                        ext = os.path.splitext(src_path)[1] or ".pdf"
                        emp_abbr = abbreviate_name(empresa)
                        
                        if "CONTRATO" in tipo_doc.upper():
                            # Contratos from materialidad don't have a client
                            new_filename = f"CONTRATO_{emp_abbr}{ext}"
                        else:
                            new_filename = f"{tipo_clean}_{emp_abbr}{ext}"
                            
                        shutil.copy2(src_path, os.path.join(dest_folder, new_filename))

                # 4. Respaldar Contratos organizadamente (Legal)
                c.execute('''
                    SELECT c.archivo_path, e.razon_social, c.cliente
                    FROM contratos c 
                    LEFT JOIN empresas e ON c.empresa_id = e.id 
                    WHERE c.archivo_path IS NOT NULL
                ''')
                for row in c.fetchall():
                    archivo_path, empresa, cliente = row
                    if not archivo_path: continue
                    
                    if not os.path.isabs(archivo_path):
                        src_path = os.path.join(PROJECT_ROOT, "backend", archivo_path)
                    else:
                        src_path = archivo_path
                        
                    if os.path.exists(src_path):
                        empresa_clean = clean_folder_name(empresa)
                        dest_folder = os.path.join(BACKUP_DIR, empresa_clean, "CONTRATOS")
                        os.makedirs(dest_folder, exist_ok=True)
                        
                        # Rename file logically
                        ext = os.path.splitext(src_path)[1] or ".pdf"
                        emp_abbr = abbreviate_name(empresa)
                        cli_abbr = abbreviate_name(cliente)
                        
                        new_filename = f"CONTRATO_{emp_abbr}_{cli_abbr}{ext}"
                        
                        shutil.copy2(src_path, os.path.join(dest_folder, new_filename))

                conn.close()

                # 5. Respaldar Expedientes CAFI
                # Reconectar usando SQLAlchemy porque ContratoCafi puede ser más fácil, o usar sqlite3 raw
                conn = sqlite3.connect(db_path)
                c = conn.cursor()
                c.execute('''
                    SELECT id, emisora, cliente, ruta_fisica, ruta_notificacion, ruta_convenio, ruta_mandato
                    FROM contratos_cafi
                ''')
                for row in c.fetchall():
                    cafi_id, emisora, cliente, r_fisica, r_notificacion, r_convenio, r_mandato = row
                    
                    empresa_clean = clean_folder_name(emisora) if emisora else "DESCONOCIDA"
                    cli_abbr = abbreviate_name(cliente) if cliente else "DESCONOCIDO"
                    emp_abbr = abbreviate_name(emisora) if emisora else "DESCONOCIDA"
                    
                    dest_folder = os.path.join(BACKUP_DIR, empresa_clean, "CAFI")
                    
                    # Rutas y prefijos
                    archivos = [
                        (r_fisica, "CONTRATO_CAFI"),
                        (r_notificacion, "NOTIFICACION_CAFI"),
                        (r_convenio, "CONVENIO_CAFI"),
                        (r_mandato, "MANDATO_CAFI")
                    ]
                    
                    for ruta_arch, prefijo in archivos:
                        if not ruta_arch: continue
                        
                        src_path = os.path.join(PROJECT_ROOT, "backend", str(ruta_arch).replace('/', os.sep))
                        if os.path.exists(src_path):
                            os.makedirs(dest_folder, exist_ok=True)
                            ext = os.path.splitext(src_path)[1] or ".pdf"
                            new_filename = f"{prefijo}_{emp_abbr}_{cli_abbr}{ext}"
                            shutil.copy2(src_path, os.path.join(dest_folder, new_filename))

                conn.close()

                # 6. Respaldar Compliance
                compliance_dir = os.path.join(os.path.dirname(PROJECT_ROOT), "compliance", "backend")
                compliance_db = os.path.join(compliance_dir, "complianceop.db")
                if os.path.exists(compliance_db):
                    shutil.copy2(compliance_db, os.path.join(BACKUP_DIR, "complianceop.db"))
                    
                    try:
                        c_conn = sqlite3.connect(compliance_db)
                        c_c = c_conn.cursor()
                        
                        # Respaldar Evidencias de Reportes
                        c_c.execute('''
                            SELECT e.file_path, r.department, r.period_year, r.period_month
                            FROM evidences e
                            JOIN department_reports r ON e.report_id = r.id
                            WHERE e.file_path IS NOT NULL
                        ''')
                        for file_path, dept, year, month in c_c.fetchall():
                            src = os.path.join(compliance_dir, file_path) if not os.path.isabs(file_path) else file_path
                            if os.path.exists(src):
                                dest = os.path.join(BACKUP_DIR, "COMPLIANCE", clean_folder_name(dept), f"{year}_{month:02d}")
                                os.makedirs(dest, exist_ok=True)
                                shutil.copy2(src, os.path.join(dest, os.path.basename(src)))
                        
                        # Respaldar Evidencias de KPIs
                        c_c.execute('''
                            SELECT e.file_path, k.department, k.period_year, k.period_month
                            FROM evidences e
                            JOIN kpi_evaluations k ON e.kpi_eval_id = k.id
                            WHERE e.file_path IS NOT NULL
                        ''')
                        for file_path, dept, year, month in c_c.fetchall():
                            src = os.path.join(compliance_dir, file_path) if not os.path.isabs(file_path) else file_path
                            if os.path.exists(src):
                                dest = os.path.join(BACKUP_DIR, "COMPLIANCE", clean_folder_name(dept), f"{year}_{month:02d}")
                                os.makedirs(dest, exist_ok=True)
                                shutil.copy2(src, os.path.join(dest, os.path.basename(src)))
                                
                        c_conn.close()
                    except Exception as ce:
                        logger.error(f"Error procesando respaldos de compliance: {ce}")
            except Exception as e:
                logger.error(f"Error reading DB for organized backup: {e}")
        else:
            logger.warning("No se encontró la base de datos para organizar el respaldo.")
            
        logger.info(f"Respaldo completado exitosamente en: {BACKUP_DIR}")
    except Exception as e:
        logger.error(f"Error al ejecutar respaldo automático: {e}")
    finally:
        _backup_lock.release()
