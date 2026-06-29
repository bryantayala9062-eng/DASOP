import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from core.database import get_db
from models.all_models import Usuario

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "erp_super_secret_key_94b7e88383a1529141f173b2241d7f45c812d3")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Usuario:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            raise credentials_exception
        username: str = str(sub)
    except JWTError:
        raise credentials_exception

    user = db.query(Usuario).filter(Usuario.username == username).first()
    if user is None or user.activo is False:
        raise credentials_exception
    return user

def require_admin(current_user: Usuario = Depends(get_current_user)):
    if current_user.es_admin is False:
        raise HTTPException(status_code=403, detail="Requiere privilegios de administrador")
    return current_user

def require_mod_legal(current_user: Usuario = Depends(get_current_user)):
    if current_user.mod_legal is False and current_user.es_admin is False:
        raise HTTPException(status_code=403, detail="No tiene acceso al módulo Legal")
    return current_user

def require_mod_materialidad(current_user: Usuario = Depends(get_current_user)):
    if current_user.mod_materialidad is False and current_user.es_admin is False:
        raise HTTPException(status_code=403, detail="No tiene acceso al módulo de Materialidad")
    return current_user

def require_mod_dashboard(current_user: Usuario = Depends(get_current_user)):
    if current_user.mod_dashboard is False and current_user.es_admin is False:
        raise HTTPException(status_code=403, detail="No tiene acceso al Dashboard XML")
    return current_user