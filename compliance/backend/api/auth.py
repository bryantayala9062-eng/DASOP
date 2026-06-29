from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from core.database import get_db
from core.security import verify_password, create_access_token, get_password_hash
from core.dependencies import get_current_user
from models.all_models import User
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    fullName: str
    username: str
    role: str
    department: str | None
    status: str
    mfaEnabled: bool
    initials: str
    lastLogin: str | None

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    token: str
    user: UserResponse


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos"
        )
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")

    # Actualizar último login
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token({"sub": str(user.id)})

    return LoginResponse(
        token=token,
        user=UserResponse(
            id=user.id,
            fullName=user.full_name,
            username=user.username,
            role=user.role,
            department=user.department,
            status=user.status,
            mfaEnabled=user.mfa_enabled,
            initials=user.initials,
            lastLogin=user.last_login.isoformat() if user.last_login else None
        )
    )

@router.post("/token", response_model=LoginResponse, include_in_schema=False)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos"
        )
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")

    user.last_login = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token({"sub": str(user.id)})

    return LoginResponse(
        token=token,
        user=UserResponse(
            id=user.id,
            fullName=user.full_name,
            username=user.username,
            role=user.role,
            department=user.department,
            status=user.status,
            mfaEnabled=user.mfa_enabled,
            initials=user.initials,
            lastLogin=user.last_login.isoformat() if user.last_login else None
        )
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        fullName=current_user.full_name,
        username=current_user.username,
        role=current_user.role,
        department=current_user.department,
        status=current_user.status,
        mfaEnabled=current_user.mfa_enabled,
        initials=current_user.initials,
        lastLogin=current_user.last_login.isoformat() if current_user.last_login else None
    )


@router.post("/logout")
def logout():
    # Con JWT stateless, el logout lo maneja el frontend eliminando el token
    return {"message": "Sesión cerrada correctamente"}


# ── Módulos accesibles ────────────────────────────────────────────────────────
MODULES_CONFIG = [
    {
        "id": "general",
        "name": "Vista General",
        "description": "Panel ejecutivo comparativo de todos los departamentos",
        "icon": "🏠",
        "color": "#b2b2b2",
        "adminOnly": True,
        "deptKey": None,
    },
    {
        "id": "legal",
        "name": "Legal",
        "description": "",
        "icon": "⚖️",
        "color": "#6366f1",
        "adminOnly": False,
        "deptKey": "Legal",
    },
    {
        "id": "admin",
        "name": "Administración",
        "description": "",
        "icon": "🏢",
        "color": "#06b6d4",
        "adminOnly": False,
        "deptKey": "Administración",
    },
    {
        "id": "tesoreria",
        "name": "Tesorería",
        "description": "",
        "icon": "💰",
        "color": "#10b981",
        "adminOnly": False,
        "deptKey": "Tesorería",
    },
    {
        "id": "contabilidad",
        "name": "Contabilidad",
        "description": "",
        "icon": "📊",
        "color": "#8b5cf6",
        "adminOnly": False,
        "deptKey": "Contabilidad",
    },
    {
        "id": "operaciones",
        "name": "Operaciones",
        "description": "",
        "icon": "⚙️",
        "color": "#f59e0b",
        "adminOnly": False,
        "deptKey": "Operaciones",
    },
    {
        "id": "rh",
        "name": "Recursos Humanos",
        "description": "",
        "icon": "👥",
        "color": "#ef4444",
        "adminOnly": False,
        "deptKey": "RH",
    },

]


@router.get("/modules")
def get_modules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Devuelve los módulos accesibles para el usuario + conteos de pendientes."""
    from models import all_models as models
    from sqlalchemy import or_
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    is_admin = current_user.role == "admin"
    result = []

    from sqlalchemy import func
    
    # 1. Tareas pendientes por departamento
    pending_tasks_query = db.query(
        models.Task.department, func.count(models.Task.id)
    ).filter(
        models.Task.status.notin_(["completed"])
    ).group_by(models.Task.department).all()
    pending_by_dept = {row[0]: row[1] for row in pending_tasks_query}
    total_pending = sum(pending_by_dept.values())

    # 2. Tareas atrasadas por departamento
    overdue_tasks_query = db.query(
        models.Task.department, func.count(models.Task.id)
    ).filter(
        models.Task.due_date < now,
        models.Task.status.notin_(["completed"])
    ).group_by(models.Task.department).all()
    overdue_by_dept = {row[0]: row[1] for row in overdue_tasks_query}
    total_overdue = sum(overdue_by_dept.values())

    # 3. Alertas sin leer por departamento (cruzando con User)
    unread_alerts_query = db.query(
        models.User.department, func.count(models.Alert.id)
    ).join(models.Alert, models.Alert.user_id == models.User.id).filter(
        models.Alert.is_read == False
    ).group_by(models.User.department).all()
    alerts_by_dept = {row[0]: row[1] for row in unread_alerts_query}
    
    global_alerts = db.query(models.Alert).filter(
        models.Alert.is_read == False, models.Alert.user_id == None
    ).count()

    for mod in MODULES_CONFIG:
        # Determinar acceso
        if mod["adminOnly"] and not is_admin:
            continue
        if not mod["adminOnly"] and not is_admin:
            if current_user.department != mod["deptKey"]:
                continue

        dept = mod["deptKey"]

        if dept:
            pending_tasks = pending_by_dept.get(dept, 0)
            overdue_tasks = overdue_by_dept.get(dept, 0)
            unread_alerts = alerts_by_dept.get(dept, 0) + global_alerts
        else:
            # Si dept es None (por ejemplo para el Dashboard Global)
            pending_tasks = total_pending
            overdue_tasks = total_overdue
            unread_alerts = sum(alerts_by_dept.values()) + global_alerts

        result.append({
            "id": mod["id"],
            "name": mod["name"],
            "description": mod["description"],
            "icon": mod["icon"],
            "color": mod["color"],
            "adminOnly": mod["adminOnly"],
            "pendingTasks": pending_tasks,
            "overdueTasks": overdue_tasks,
            "unreadAlerts": unread_alerts,
        })

    return {"modules": result, "user": {
        "id": current_user.id,
        "fullName": current_user.full_name,
        "role": current_user.role,
        "department": current_user.department,
        "initials": current_user.initials,
    }}
