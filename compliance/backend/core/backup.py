import os
import shutil
import logging
import threading
from datetime import datetime

logger = logging.getLogger(__name__)

# Directorios Base
COMPLIANCE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_DIR = r"C:\Users\Administrador\Desktop\Respaldo_Compliance_Actual"

_backup_lock = threading.Lock()

import subprocess

def safe_copy(src, dst):
    """
    Intenta copiar el archivo normalmente con shutil.
    Si falla, intenta usar PowerShell Copy-Item para forzar la lectura.
    """
    try:
        shutil.copy2(src, dst)
        return True
    except Exception as e:
        logger.warning(f"Error copiando {src} con shutil ({e}). Intentando con PowerShell...")
        try:
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

def ejecutar_respaldo_compliance():
    """
    Sincroniza la base de datos de compliance y los PDFs subidos al directorio de respaldo en el escritorio.
    Se ejecuta de forma sincrónica, pero debe ser llamado desde un Thread para no bloquear el request.
    """
    if not _backup_lock.acquire(blocking=False):
        logger.info("Un respaldo de Compliance ya está en curso, omitiendo ejecución concurrente.")
        return

    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        
        # 1. Respaldar Base de Datos SQLite
        try:
            sqlite_src = os.path.join(COMPLIANCE_ROOT, "complianceop.db")
            if os.path.exists(sqlite_src):
                safe_copy(sqlite_src, os.path.join(BACKUP_DIR, "complianceop.db"))
        except Exception as e:
            logger.error(f"Error al respaldar Base de Datos SQLite (Compliance): {e}")
            
        # 2. Respaldar PDFs (Uploads)
        try:
            uploads_src = os.path.join(COMPLIANCE_ROOT, "uploads")
            uploads_dest = os.path.join(BACKUP_DIR, "uploads")
            
            if os.path.exists(uploads_src):
                # shutil.copytree with dirs_exist_ok=True updates existing files and adds new ones
                shutil.copytree(uploads_src, uploads_dest, dirs_exist_ok=True)
        except Exception as e:
            logger.error(f"Error al respaldar PDFs de Uploads (Compliance): {e}")
            
        logger.info(f"Respaldo de Compliance completado exitosamente en: {BACKUP_DIR}")
    except Exception as e:
        logger.error(f"Error general al ejecutar respaldo automático de Compliance: {e}")
    finally:
        _backup_lock.release()

