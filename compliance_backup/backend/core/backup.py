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
        sqlite_src = os.path.join(COMPLIANCE_ROOT, "complianceop.db")
        if os.path.exists(sqlite_src):
            shutil.copy2(sqlite_src, os.path.join(BACKUP_DIR, "complianceop.db"))
            
        # 2. Respaldar PDFs (Uploads)
        uploads_src = os.path.join(COMPLIANCE_ROOT, "uploads")
        uploads_dest = os.path.join(BACKUP_DIR, "uploads")
        
        if os.path.exists(uploads_src):
            # shutil.copytree with dirs_exist_ok=True updates existing files and adds new ones
            shutil.copytree(uploads_src, uploads_dest, dirs_exist_ok=True)
            
        logger.info(f"Respaldo de Compliance completado exitosamente en: {BACKUP_DIR}")
    except Exception as e:
        logger.error(f"Error al ejecutar respaldo automático de Compliance: {e}")
    finally:
        _backup_lock.release()
