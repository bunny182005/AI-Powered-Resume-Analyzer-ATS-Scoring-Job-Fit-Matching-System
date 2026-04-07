from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
from models.user import User
from core.auth import hash_password, verify_password, create_token

router = APIRouter()

@router.post("/signup")
def signup(data: dict, db: Session = Depends(get_db)):
    user = User(
        name=data["name"],
        email=data["email"],
        password=hash_password(data["password"])
    )
    db.add(user)
    db.commit()
    return {"msg": "user created"}

@router.post("/login")
def login(data: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data["email"]).first()
    if not user or not verify_password(data["password"], user.password):
        return {"error": "invalid"}
    return {"token": create_token(user.id)}