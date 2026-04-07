from pydantic import BaseModel, Field
from typing import List

class ResumeAnalyzeRequest(BaseModel):
    resume_text: str = Field(..., description="The extracted text from the candidate's resume")
    job_description: str = Field(..., description="The target job description text")

class ResumeAnalyzeResponse(BaseModel):
    match_score: float = Field(..., description="Overall fit score out of 100")
    missing_skills: List[str] = Field(default_factory=list, description="Skills present in JD but missing in resume")
    recommendations: List[str] = Field(default_factory=list, description="Actionable steps to improve the resume")
class BulletImproveRequest(BaseModel):
    original_bullet: str = Field(..., description="A single bullet point from the user's resume")
    job_description: str = Field(..., description="The target job description")

class BulletImproveResponse(BaseModel):
    critique: str = Field(..., description="Why the original bullet was weak")
    star_rewrite: str = Field(..., description="The improved bullet point using the STAR method")