from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import shutil
import uuid
import os

from src.services.ats_score import ats_scorer

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/analyze")
async def analyze_resume(
    job_description: str = Form(...),
    file: UploadFile = File(...)
):
    temp_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    input_path = f"./outputs/temp_{temp_id}{ext}"

    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        from src.utils.parser import ParserFactory
        parser = ParserFactory.get_parser(input_path)
        resume_text = parser.extract_text(input_path)

        result = ats_scorer.analyze_application(
            resume_text=resume_text,
            jd_text=job_description
        )

        os.remove(input_path)

        return result

    except Exception as e:
        print("🔥 ERROR:", str(e))
        raise HTTPException(status_code=500, detail=str(e))