from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

class ContratoBase(BaseModel):
    cliente: str
    tipo_contrato: str
    responsable_interno: str
    email_responsable: str
    email_legal: Optional[str] = None
    empresa: Optional[str] = None
    representante_cliente: Optional[str] = None
    concepto: Optional[str] = None
    periodo: Optional[str] = None
    clave_periodo: Optional[str] = None
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    declaraciones_cliente: Optional[str] = None
    representante_empresa: Optional[str] = None
    estatus: Optional[str] = "hecho"
    gen_template: Optional[bool] = False

class QuickContratoRequest(BaseModel):
    cliente: str
    empresa_id: int
    tipo_contrato: str = "PRESTACIÓN DE SERVICIOS"
    concepto: Optional[str] = None

class ContratoResponse(ContratoBase):
    id: int
    estatus: str
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    dias_en_estatus: int
    alerta: str
    archivo_path: Optional[str] = None
    tiene_pdf: Optional[bool] = False
    empresa_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)

class BitacoraResponse(BaseModel):
    id: int
    usuario_id: Optional[int]
    usuario_nombre: Optional[str] = "Sistema"
    accion: str
    detalles: str
    fecha: datetime
    model_config = ConfigDict(from_attributes=True)

class ComentarioRequest(BaseModel):
    texto: str

class ComentarioResponse(BaseModel):
    id: int
    usuario_id: int
    usuario_nombre: str
    texto: str
    fecha: datetime
    model_config = ConfigDict(from_attributes=True)

class EstatusUpdate(BaseModel):
    estatus: str
