from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from core.database import get_db
from core.dependencies import get_current_user, require_admin
from models import all_models as models
from app.auth import get_password_hash
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/api/users", tags=["Usuarios"])


class UserCreate(BaseModel):
    full_name: str
    username: str
    email: Optional[str] = None
    password: str
    role: str = "employee"
    department: Optional[str] = None
    organization_id: Optional[int] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


def user_to_dict(u: models.User):
    return {
        "id": u.id,
        "fullName": u.full_name,
        "email": u.email,
        "role": u.role,
        "department": u.department,
        "status": u.status,
        "mfaEnabled": u.mfa_enabled,
        "initials": u.initials,
        "lastLogin": u.last_login.isoformat() if u.last_login else None,
        "createdAt": u.created_at.isoformat() if u.created_at else None
    }


@router.get("")
def list_users(db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    users = db.query(models.User).all()
    return [user_to_dict(u) for u in users]


@router.post("", status_code=201)
def create_user(data: UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    existing = db.query(models.User).filter(models.User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está registrado")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")

    user = models.User(
        full_name=data.full_name,
        username=data.username,
        email=data.email,
        password_hash=get_password_hash(data.password),
        role=data.role,
        department=data.department,
        organization_id=data.organization_id,
        status="active"
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@router.put("/{user_id}")
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    update_data = data.dict(exclude_unset=True)
    if "password" in update_data and update_data["password"]:
        if len(update_data["password"]) < 6:
            raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
        update_data["password_hash"] = get_password_hash(update_data.pop("password"))
    elif "password" in update_data:
        del update_data["password"]
        
    for field, value in update_data.items():
        setattr(user, field, value)
    db.commit()
    return user_to_dict(user)

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta de esta forma")
        
    user.status = "inactive"
    db.commit()
    return {"message": "Usuario desactivado correctamente"}

@router.put("/profile/me")
def update_my_profile(data: UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    update_data = data.dict(exclude_unset=True)
    
    # Prevenir que cambie su propio rol o departamento
    if "role" in update_data:
        del update_data["role"]
    if "department" in update_data:
        del update_data["department"]
    if "status" in update_data:
        del update_data["status"]
        
    if "password" in update_data and update_data["password"]:
        if len(update_data["password"]) < 6:
            raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
        update_data["password_hash"] = get_password_hash(update_data.pop("password"))
    elif "password" in update_data:
        del update_data["password"]
        
    for field, value in update_data.items():
        setattr(current_user, field, value)
    db.commit()
    return user_to_dict(current_user)
