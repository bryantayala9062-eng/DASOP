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

import subprocess

def safe_copy(src, dst):
    """
    Intenta copiar el archivo normalmente con shutil.
    Si falla (probablemente porque está bloqueado por Excel), intenta usar PowerShell Copy-Item para forzar la lectura.
    """
    try:
        shutil.copy2(src, dst)
        return True
    except Exception as e:
        logger.warning(f"Error copiando {src} con shutil ({e}). Intentando con PowerShell...")
        try:
            # PowerShell Copy-Item -Force puede a veces leer archivos que Python no puede
            result = subprocess.run(
                ["powershell", "-Command", f"Copy-Item -Path '{src}' -Destination '{dst}' -Force"],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                logger.info(f"Copia exitosa usando PowerShell para {src}")
                return True
            else:
                logger.error(f"Error copiando con PowerShell: {result.stderr}")
                return False
        except Exception as p_e:
            logger.error(f"Fallo catastrófico al copiar {src}: {p_e}")
            return False

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
        try:
            sqlite_src = os.path.join(PROJECT_ROOT, "backend", "portal_erp.db")
            if os.path.exists(sqlite_src):
                safe_copy(sqlite_src, os.path.join(BACKUP_DIR, "portal_erp.db"))
        except Exception as e:
            logger.error(f"Error al respaldar SQLite: {e}")
            
        # 2. Respaldar Excel madre
        try:
            excel_src = os.path.join(PROJECT_ROOT, "Bases_de_Datos", "dashboard_xml", "BaseDatosFACTURASoptimal.xlsx")
            if os.path.exists(excel_src):
                if not safe_copy(excel_src, os.path.join(BACKUP_DIR, "BaseDatosFACTURASoptimal.xlsx")):
                    logger.warning(f"ADVERTENCIA: No se pudo respaldar el Excel madre. Es posible que esté abierto y bloqueado de forma exclusiva.")
        except Exception as e:
            logger.error(f"Error al respaldar Excel madre: {e}")
            
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

        db_path = os.path.join(PROJECT_ROOT, "backend", "portal_erp.db")
        if os.path.exists(db_path):
            # 3. Respaldar Materialidad organizadamente
            try:
                conn = sqlite3.connect(db_path)
                c = conn.cursor()
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
                            new_filename = f"CONTRATO_{emp_abbr}{ext}"
                        else:
                            new_filename = f"{tipo_clean}_{emp_abbr}{ext}"
                            
                        safe_copy(src_path, os.path.join(dest_folder, new_filename))
                conn.close()
            except Exception as e:
                logger.error(f"Error al respaldar materialidad: {e}")

            # 4. Respaldar Contratos organizadamente (Legal)
            try:
                conn = sqlite3.connect(db_path)
                c = conn.cursor()
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
                        
                        safe_copy(src_path, os.path.join(dest_folder, new_filename))
                conn.close()
            except Exception as e:
                logger.error(f"Error al respaldar Contratos (Legal): {e}")

            # 5. Respaldar Expedientes CAFI
            try:
                conn = sqlite3.connect(db_path)
                c = conn.cursor()
                c.execute('''
                    SELECT id, emisora, cliente, ruta_fisica, ruta_notificacion, ruta_convenio
                    FROM contratos_cafi
                ''')
                for row in c.fetchall():
                    cafi_id, emisora, cliente, r_fisica, r_notificacion, r_convenio = row
                    
                    empresa_clean = clean_folder_name(emisora) if emisora else "DESCONOCIDA"
                    cli_abbr = abbreviate_name(cliente) if cliente else "DESCONOCIDO"
                    emp_abbr = abbreviate_name(emisora) if emisora else "DESCONOCIDA"
                    
                    dest_folder = os.path.join(BACKUP_DIR, empresa_clean, "CAFI")
                    
                    archivos = [
                        (r_fisica, "CONTRATO_CAFI"),
                        (r_notificacion, "NOTIFICACION_CAFI"),
                        (r_convenio, "CONVENIO_CAFI")
                    ]
                    
                    for ruta_arch, prefijo in archivos:
                        if not ruta_arch: continue
                        
                        src_path = os.path.join(PROJECT_ROOT, "backend", str(ruta_arch).replace('/', os.sep))
                        if os.path.exists(src_path):
                            os.makedirs(dest_folder, exist_ok=True)
                            ext = os.path.splitext(src_path)[1] or ".pdf"
                            new_filename = f"{prefijo}_{emp_abbr}_{cli_abbr}{ext}"
                            safe_copy(src_path, os.path.join(dest_folder, new_filename))
                conn.close()
            except Exception as e:
                logger.error(f"Error al respaldar CAFI: {e}")
        else:
            logger.warning("No se encontró la base de datos para organizar el respaldo (Materialidad, Contratos, CAFI).")
            
        logger.info(f"Respaldo completado exitosamente en: {BACKUP_DIR}")
    except Exception as e:
        logger.error(f"Error general al ejecutar respaldo automático: {e}")
    finally:
        _backup_lock.release()

