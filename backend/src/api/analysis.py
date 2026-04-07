from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
from models.analysis import Analysis

router = APIRouter()

@router.post("/save")
def save(data: dict, db: Session = Depends(get_db)):
    a = Analysis(**data)
    db.add(a)
    db.commit()
    return {"ok": True}

@router.get("/all")
def get_all(db: Session = Depends(get_db)):
    return db.query(Analysis).all()