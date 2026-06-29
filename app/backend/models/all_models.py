from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from core.database import Base

# ==========================================
# MÓDULO: SEGURIDAD Y USUARIOS
# ==========================================
class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True)
    email = Column(String(255), nullable=True, index=True)
    nombre = Column(String(255))
    hashed_password = Column(String(255))
    activo = Column(Boolean, default=True, nullable=False)
    
    # PERMISOS / MÓDULOS PERMITIDOS
    es_admin = Column(Boolean, default=False)
    mod_legal = Column(Boolean, default=False)
    mod_materialidad = Column(Boolean, default=False)
    mod_dashboard = Column(Boolean, default=False)
    
    # AISLAMIENTO DE DATOS
    departamento = Column(String(100), nullable=True)
    empresa_filtro = Column(String(100), nullable=True)
    
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    ultima_conexion = Column(DateTime, nullable=True)
    ultimo_heartbeat = Column(DateTime, nullable=True)

    # Relaciones
    bitacoras = relationship("Bitacora", back_populates="usuario")


# ==========================================
# MÓDULO: EMPRESAS GLOBALES
# ==========================================
class Empresa(Base):
    """Directorio unificado de empresas (Aplica para Legal y Materialidad)"""
    __tablename__ = "empresas"

    id = Column(Integer, primary_key=True, index=True)
    razon_social = Column(String(255), nullable=False)
    rfc = Column(String(13), unique=True, nullable=False)
    
    # Relaciones
    documentos = relationship("DocumentoMaterialidad", back_populates="empresa")


# ==========================================
# MÓDULO: SEGUIMIENTO LEGAL
# ==========================================
class Contrato(Base):
    __tablename__ = "contratos"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String(50), unique=True, index=True, nullable=True)
    cliente = Column(String(255), index=True)
    representante_cliente = Column(String(255), nullable=True)
    empresa = Column(String(255), nullable=True)
    tipo_contrato = Column(String(100))
    concepto = Column(String(255), nullable=True)
    responsable_interno = Column(String(255))
    email_responsable = Column(String(255))
    email_legal = Column(String(255), nullable=True)
    periodo = Column(String(50), nullable=True)
    clave_periodo = Column(String(5), nullable=True)
    fecha_inicio = Column(DateTime, nullable=True)
    fecha_fin = Column(DateTime, nullable=True)
    estatus = Column(String(50), default="hecho")
    archivo_path = Column(String(500), nullable=True)
    link_documento = Column(String(500), nullable=True)
    notas = Column(Text, nullable=True)

    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    fecha_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Vínculo con Materialidad (Directorio de Empresas)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=True)

    # Relaciones
    bitacoras = relationship("Bitacora", back_populates="contrato")
    comentarios = relationship("Comentario", back_populates="contrato")
    empresa_rel = relationship("Empresa", foreign_keys=[empresa_id])



class Bitacora(Base):
    __tablename__ = "bitacoras"

    id = Column(Integer, primary_key=True, index=True)
    contrato_id = Column(Integer, ForeignKey("contratos.id"))
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    
    accion = Column(String(100))
    detalles = Column(Text)
    fecha = Column(DateTime, default=datetime.utcnow)

    # Relaciones
    contrato = relationship("Contrato", back_populates="bitacoras")
    usuario = relationship("Usuario", back_populates="bitacoras")

class Comentario(Base):
    __tablename__ = "comentarios"

    id = Column(Integer, primary_key=True, index=True)
    contrato_id = Column(Integer, ForeignKey("contratos.id"))
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    texto = Column(String(1000))
    fecha = Column(DateTime, default=datetime.utcnow)

    contrato = relationship("Contrato", back_populates="comentarios")
    usuario = relationship("Usuario")

# ==========================================
# MÓDULO: MATERIALIDAD
# ==========================================
class DocumentoMaterialidad(Base):
    __tablename__ = "documentos_materialidad"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False)
    tipo_documento = Column(String(100), nullable=False)
    ruta_fisica = Column(String(500), nullable=False)
    fecha_subida = Column(DateTime, default=datetime.utcnow)

    # Valores posibles: "POSITIVA", "NEGATIVA", None (cuando no aplica o no se detectó)
    resultado_op = Column(String(20), nullable=True)
    # Periodo al que corresponde el documento, ej: "ABRIL 2026"
    periodo = Column(String(50), nullable=True)

    # Vínculo opcional con Seguimiento Legal (para CONTRATO_MARCO)
    contrato_id = Column(Integer, ForeignKey("contratos.id"), nullable=True)

    # Relaciones
    empresa = relationship("Empresa", back_populates="documentos")
    contrato_rel = relationship("Contrato", foreign_keys=[contrato_id])


class ContratoCafi(Base):
    __tablename__ = "contratos_cafi"

    id = Column(Integer, primary_key=True, index=True)
    emisora = Column(String(255), nullable=True)
    cliente = Column(String(255), nullable=True, index=True)
    fecha_creacion = Column(DateTime, nullable=True)
    fecha_vencimiento = Column(DateTime, nullable=True)
    ruta_fisica = Column(String(500), nullable=True) # Contrato CAFI (nullable para permitir crear expediente sin este archivo inicialmente)
    ruta_notificacion = Column(String(500), nullable=True)
    ruta_convenio = Column(String(500), nullable=True)
    ruta_mandato = Column(String(500), nullable=True)
    fecha_subida = Column(DateTime, default=datetime.utcnow)

    # Campos de materialidad (estatus del proceso legal)
    estatus_redaccion = Column(String(20), nullable=True, default="pendiente")   # pendiente | en_proceso | completo
    estatus_notaria = Column(String(20), nullable=True, default="pendiente")     # pendiente | en_proceso | completo
    estatus_firma = Column(String(20), nullable=True, default="pendiente")       # pendiente | en_proceso | completo

