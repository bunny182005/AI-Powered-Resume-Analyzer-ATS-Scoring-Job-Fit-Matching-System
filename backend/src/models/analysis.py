from sqlalchemy import Column, Integer, String, Float, ForeignKey
from core.database import Base

class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    score = Column(Float)
    summary = Column(String)