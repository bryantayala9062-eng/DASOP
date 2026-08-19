from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from core.database import get_db
from models.all_models import ElectronicSignature, User
from api.auth import get_current_user

router = APIRouter(prefix="/api/signatures", tags=["signatures"])

# Pydantic Schemas
class SignatureCreate(BaseModel):
    name: str
    issue_date: str
    expiration_date: Optional[str] = None

class SignatureResponse(BaseModel):
    id: int
    name: str
    issue_date: datetime
    expiration_date: datetime
    is_expired: bool
    created_by_user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

@router.get("", response_model=List[SignatureResponse])
@router.get("/", response_model=List[SignatureResponse])
def get_signatures(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Contabilidad module only or admin
    if current_user.role != "admin" and current_user.department != "Contabilidad" and current_user.username.lower() != "carlos":
        # Allow them to see if needed, but normally restricted. We will just return all for now, UI hides it.
        pass

    signatures = db.query(ElectronicSignature).all()
    
    # Calculate is_expired on the fly
    now = datetime.now(timezone.utc)
    results = []
    for sig in signatures:
        # Ensure dates are timezone aware for comparison
        exp_date = sig.expiration_date
        if exp_date.tzinfo is None:
            exp_date = exp_date.replace(tzinfo=timezone.utc)
            
        is_expired = now > exp_date
        
        results.append({
            "id": sig.id,
            "name": sig.name,
            "issue_date": sig.issue_date,
            "expiration_date": sig.expiration_date,
            "is_expired": is_expired,
            "created_by_user_id": sig.created_by_user_id,
            "created_at": sig.created_at
        })
        
    return results

@router.post("", response_model=SignatureResponse)
@router.post("/", response_model=SignatureResponse)
def create_signature(sig_in: SignatureCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Parse issue date
    try:
        # Expected format: YYYY-MM-DD
        dt_issue = datetime.strptime(sig_in.issue_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Usa YYYY-MM-DD")
        
    # Calculate expiration
    if sig_in.expiration_date:
        try:
            dt_exp = datetime.strptime(sig_in.expiration_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha de vencimiento inválido. Usa YYYY-MM-DD")
    else:
        try:
            dt_exp = dt_issue.replace(year=dt_issue.year + 4)
        except ValueError:
            # Handle leap year issue (Feb 29)
            dt_exp = dt_issue + timedelta(days=4*365 + 1)
        
    new_sig = ElectronicSignature(
        name=sig_in.name,
        issue_date=dt_issue,
        expiration_date=dt_exp,
        created_by_user_id=current_user.id
    )
    
    db.add(new_sig)
    db.commit()
    db.refresh(new_sig)
    
    now = datetime.now(timezone.utc)
    is_expired = now > dt_exp
    
    return {
        "id": new_sig.id,
        "name": new_sig.name,
        "issue_date": new_sig.issue_date,
        "expiration_date": new_sig.expiration_date,
        "is_expired": is_expired,
        "created_by_user_id": new_sig.created_by_user_id,
        "created_at": new_sig.created_at
    }

@router.delete("/{sig_id}")
def delete_signature(sig_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sig = db.query(ElectronicSignature).filter(ElectronicSignature.id == sig_id).first()
    if not sig:
        raise HTTPException(status_code=404, detail="Firma no encontrada")
        
    db.delete(sig)
    db.commit()
    return {"status": "ok"}

@router.put("/{sig_id}", response_model=SignatureResponse)
def update_signature(sig_id: int, sig_in: SignatureCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sig = db.query(ElectronicSignature).filter(ElectronicSignature.id == sig_id).first()
    if not sig:
        raise HTTPException(status_code=404, detail="Firma no encontrada")
        
    try:
        dt_issue = datetime.strptime(sig_in.issue_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Usa YYYY-MM-DD")
        
    if sig_in.expiration_date:
        try:
            dt_exp = datetime.strptime(sig_in.expiration_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha de vencimiento inválido. Usa YYYY-MM-DD")
    else:
        try:
            dt_exp = dt_issue.replace(year=dt_issue.year + 4)
        except ValueError:
            dt_exp = dt_issue + timedelta(days=4*365 + 1)
        
    sig.name = sig_in.name
    sig.issue_date = dt_issue
    sig.expiration_date = dt_exp
    
    db.commit()
    db.refresh(sig)
    
    now = datetime.now(timezone.utc)
    is_expired = now > dt_exp
    
    return {
        "id": sig.id,
        "name": sig.name,
        "issue_date": sig.issue_date,
        "expiration_date": sig.expiration_date,
        "is_expired": is_expired,
        "created_by_user_id": sig.created_by_user_id,
        "created_at": sig.created_at
    }
