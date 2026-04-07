from fastapi import FastAPI
from core.database import Base, engine
from api import auth, analysis

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.include_router(auth.router, prefix="/auth")
app.include_router(analysis.router, prefix="/analysis")

@app.get("/")
def home():
    return {"msg": "running"}