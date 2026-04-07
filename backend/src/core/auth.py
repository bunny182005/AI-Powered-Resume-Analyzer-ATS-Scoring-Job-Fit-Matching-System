
from jose import jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"])

def hash_password(password):
    return pwd_context.hash(password)

def verify_password(p, h):
    return pwd_context.verify(p, h)

def create_token(user_id: int):
    return jwt.encode(
        {"sub": str(user_id), "exp": datetime.utcnow() + timedelta(days=7)},
        settings.secret_key,
        algorithm=settings.algorithm,
    )