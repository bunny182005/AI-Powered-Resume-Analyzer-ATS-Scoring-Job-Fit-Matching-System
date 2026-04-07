from src.services.ats_score import ats_scorer
from src.services.ner import ner_service
from src.services.suggestions import suggestion_service

from fastapi import APIRouter
from pydantic import BaseModel
import os
from dotenv import load_dotenv

# ✅ INIT
load_dotenv()
router = APIRouter(prefix="/api")

# ✅ REQUEST MODEL
class Req(BaseModel):
    resume: str
    jd: str

# ✅ MAIN ROUTE
@router.post("/analyze")
async def analyze(data: Req):
    try:
        resume_text = data.resume
        jd = data.jd

        # 🔹 STEP 1: NER
        entities = ner_service.extract_entities(resume_text)

        # 🔹 STEP 2: ATS
        ats = ats_scorer.analyze_application(resume_text, jd)
        final_score = ats.get("match_score", 0)

        # 🔹 STEP 3: Suggestions
        first_bullet = resume_text.split("\n")[0] if resume_text else ""

        suggestion_data = suggestion_service.rewrite_bullet_star(first_bullet, jd)

        suggestions = [
        str(suggestion_data.get("critique", "")),
        str(suggestion_data.get("star_rewrite", ""))
]

        # ✅ FINAL RESPONSE
        return {
            "match_score": round(final_score),
            "candidate_name": "Candidate",
            "job_title": "Role",
            "breakdown": [],
            "keyword_metrics": ats.get("keyword_metrics", {
                "total": len(entities),
                "matched": entities[:5],
                "missing": []
            }),
            "recommendations": suggestions,
            "summary": "Hybrid ATS + AI evaluation"
        }

    except Exception as e:
        return {
            "match_score": 50,
            "candidate_name": "Candidate",
            "job_title": "Error",
            "breakdown": [],
            "keyword_metrics": {"total": 0, "matched": [], "missing": []},
            "recommendations": [str(e)],
            "summary": "Backend error occurred"
        }