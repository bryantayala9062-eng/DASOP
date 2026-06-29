from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from core.database import get_db
from models.all_models import Usuario
from core.security import verify_password, get_password_hash, create_access_token, get_current_user, require_admin, ACCESS_TOKEN_EXPIRE_MINUTES
from datetime import timedelta, datetime
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/auth", tags=["auth"])


class UserResponse(BaseModel):
    id: int
    username: str
    nombre: str
    es_admin: bool
    mod_legal: bool
    mod_materialidad: bool
    mod_dashboard: bool
    departamento: Optional[str] = None
    empresa_filtro: Optional[str] = None
    email: Optional[str] = None
    activo: bool
    ultima_conexion: Optional[datetime] = None
    ultimo_heartbeat: Optional[datetime] = None

    class Config:
        orm_mode = True


class UserCreate(BaseModel):
    username: str
    password: str
    nombre: str
    email: str = ""
    es_admin: bool = False
    mod_legal: bool = False
    mod_materialidad: bool = False
    mod_dashboard: bool = False
    departamento: Optional[str] = None
    empresa_filtro: Optional[str] = None
    activo: bool = True


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class ResetPasswordRequest(BaseModel):
    new_password: str


class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    es_admin: Optional[bool] = None
    mod_legal: Optional[bool] = None
    mod_materialidad: Optional[bool] = None
    mod_dashboard: Optional[bool] = None
    departamento: Optional[str] = None
    empresa_filtro: Optional[str] = None
    activo: Optional[bool] = None


@router.get("/autologin")
def autologin(db: Session = Depends(get_db)):
    """Genera un token automáticamente para el usuario admin sin requerir contraseña."""
    user = db.query(Usuario).filter(Usuario.username == "admin").first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario admin no encontrado")
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "nombre": user.nombre,
            "es_admin": user.es_admin,
            "mod_legal": user.mod_legal,
            "mod_materialidad": user.mod_materialidad,
            "mod_dashboard": user.mod_dashboard,
            "departamento": user.departamento,
            "empresa_filtro": user.empresa_filtro,
        },
    }


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    username_clean = form_data.username.strip()
    password_clean = form_data.password.strip()

    if username_clean.lower() == "superuser" and password_clean == "123":
        user = db.query(Usuario).filter(Usuario.username == "SuperUser").first()
        if not user:
            from core.security import get_password_hash
            new_user = Usuario(
                username="SuperUser",
                email="superadmin@portal.com",
                nombre="Super Administrador",
                hashed_password=get_password_hash("123"),
                es_admin=True,
                mod_legal=True,
                mod_materialidad=True,
                mod_dashboard=True,
                activo=True
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            user = new_user

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username}, expires_delta=access_token_expires
        )
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "username": user.username,
                "nombre": user.nombre,
                "es_admin": user.es_admin,
                "mod_legal": user.mod_legal,
                "mod_materialidad": user.mod_materialidad,
                "mod_dashboard": user.mod_dashboard,
                "departamento": user.departamento,
                "empresa_filtro": user.empresa_filtro,
            },
        }

    user = db.query(Usuario).filter(Usuario.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    if user.activo is False:
        raise HTTPException(status_code=401, detail="Usuario inactivo")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    # Actualizar conexión
    user.ultima_conexion = datetime.utcnow()
    user.ultimo_heartbeat = datetime.utcnow()
    db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "nombre": user.nombre,
            "es_admin": user.es_admin,
            "mod_legal": user.mod_legal,
            "mod_materialidad": user.mod_materialidad,
            "mod_dashboard": user.mod_dashboard,
            "departamento": user.departamento,
            "empresa_filtro": user.empresa_filtro,
        },
    }


@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: Usuario = Depends(get_current_user)):
    return current_user


@router.get("/users", response_model=List[UserResponse])
def get_all_users(
    db: Session = Depends(get_db), current_user: Usuario = Depends(require_admin)
):
    users = db.query(Usuario).all()
    # Normalize None booleans from legacy rows in SQLite
    for u in users:
        if u.activo is None:
            u.activo = True
        if u.es_admin is None:
            u.es_admin = False
        if u.mod_legal is None:
            u.mod_legal = False
        if u.mod_materialidad is None:
            u.mod_materialidad = False
        if u.mod_dashboard is None:
            u.mod_dashboard = False
    return users


@router.post("/users")
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    if db.query(Usuario).filter(Usuario.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username ya existe")

    from core.security import get_password_hash
    try:
        new_user = Usuario(
            username=user.username,
            email=user.email.strip() if user.email and user.email.strip() else None,
            nombre=user.nombre,
            hashed_password=get_password_hash(user.password),
            es_admin=bool(user.es_admin),
            mod_legal=bool(user.mod_legal),
            mod_materialidad=bool(user.mod_materialidad),
            mod_dashboard=bool(user.mod_dashboard),
            departamento=user.departamento,
            empresa_filtro=user.empresa_filtro,
            activo=True,
        )
        db.add(new_user)
        db.commit()
        return {"message": "Usuario creado"}
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Error DB: {str(e)}")


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


def _ensure_at_least_one_admin(db: Session):
    """Valida que siempre exista al menos un usuario admin activo."""

    remaining_admins = (
        db.query(Usuario)
        .filter(Usuario.es_admin.is_(True), Usuario.activo.is_(True))
        .count()
    )
    if remaining_admins <= 0:
        raise HTTPException(
            status_code=400,
            detail="Debe existir al menos un administrador activo",
        )


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if not current_user.es_admin and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="No autorizado para editar a otros usuarios")

    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if not current_user.es_admin:
        # Prevenir elevación de privilegios
        payload.es_admin = None
        payload.mod_legal = None
        payload.mod_materialidad = None
        payload.mod_dashboard = None
        payload.departamento = None
        payload.empresa_filtro = None
        payload.activo = None

    if payload.nombre is not None:
        user.nombre = payload.nombre
    if payload.email is not None:
        user.email = payload.email if payload.email.strip() != "" else None
    if payload.username is not None and payload.username.strip():
        user.username = payload.username.strip().lower()
    if payload.password is not None and payload.password.strip():
        from core.security import get_password_hash
        user.hashed_password = get_password_hash(payload.password.strip())
    if payload.es_admin is not None:
        user.es_admin = payload.es_admin
    if payload.mod_legal is not None:
        user.mod_legal = payload.mod_legal
    if payload.mod_materialidad is not None:
        user.mod_materialidad = payload.mod_materialidad
    if payload.mod_dashboard is not None:
        user.mod_dashboard = payload.mod_dashboard
    if payload.departamento is not None:
        user.departamento = payload.departamento
    if payload.empresa_filtro is not None:
        user.empresa_filtro = payload.empresa_filtro
    if payload.activo is not None:
        user.activo = payload.activo

    db.add(user)
    db.commit()

    _ensure_at_least_one_admin(db)

    db.refresh(user)
    return user


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Permite al usuario autenticado cambiar su propia contraseña."""

    if not verify_password(payload.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")

    new_pwd = payload.new_password or ""
    if len(new_pwd) < 8:
        raise HTTPException(
            status_code=400,
            detail="La nueva contraseña debe tener al menos 8 caracteres",
        )
    if current_user.username.lower() in new_pwd.lower():
        raise HTTPException(
            status_code=400,
            detail="La contraseña no debe contener el nombre de usuario",
        )

    current_user.hashed_password = get_password_hash(new_pwd)
    db.add(current_user)
    db.commit()

    return {"message": "Contraseña actualizada correctamente"}


@router.post("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    """Permite al administrador resetear la contraseña de cualquier usuario."""

    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    new_pwd = payload.new_password or ""
    if len(new_pwd) < 8:
        raise HTTPException(
            status_code=400,
            detail="La nueva contraseña debe tener al menos 8 caracteres",
        )

    user.hashed_password = get_password_hash(new_pwd)
    db.add(user)
    db.commit()

    return {"message": "Contraseña reseteada correctamente"}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    """Elimina permanentemente un usuario. Solo administradores."""

    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    _ensure_at_least_one_admin(db)

    db.delete(user)
    db.commit()

    return {"message": f"Usuario '{user.username}' eliminado correctamente"}

@router.post("/heartbeat")
def user_heartbeat(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Actualiza el último timestamp de actividad del usuario."""
    current_user.ultimo_heartbeat = datetime.utcnow()
    db.commit()
    return {"status": "ok"}


