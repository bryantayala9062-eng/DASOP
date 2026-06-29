"""Configuration settings for the dashboard backend."""
from functools import lru_cache
from typing import List
import os

class Settings:
    """Application settings."""
    
    def __init__(self):
        self.cors_origins = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]
        # Path to the Excel data file - relative to project root
        # config.py is at app/backend/api/dashboard/ → 4 levels up to reach app/
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        self.file_path = os.path.join(project_root, "Bases_de_Datos", "dashboard_xml", "BaseDatosFACTURASoptimal.xlsx")
    
    def allowed_origins(self) -> List[str]:
        """Return list of allowed CORS origins."""
        return self.cors_origins

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
