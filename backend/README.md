# AI-Powered Resume Analysis, ATS Scoring & Job Fit Matching System

An end-to-end NLP project that analyzes a resume against a job description and returns:

- ATS Score (0-100)
- Semantic Job Fit Score (0-1)
- Matched keywords
- Missing keywords
- Actionable improvement suggestions

## Features

- **Resume parsing**:
  - PDF parsing with `PyMuPDF`
  - DOCX parsing with `python-docx`
- **NLP pipeline with spaCy**:
  - Tokenization/POS/NER pipeline support
  - Custom entity extraction for `SKILL`, `DEGREE`, `JOB_TITLE`, `COMPANY`, `CERTIFICATION`
- **Keyword extraction**:
  - TF-IDF-based keyword extraction from JD
  - Resume-vs-JD keyword matching
- **ATS scoring engine** (weighted):
  - Keyword match (30%)
  - Section presence (25%)
  - Formatting (20%)
  - Action verbs (15%)
  - Contact info completeness (10%)
- **Semantic matching**:
  - `Sentence-BERT` model `all-mpnet-base-v2`
  - Cosine similarity score between resume and JD
- **Suggestion engine**:
  - Missing keyword recommendations
  - Weak section and formatting guidance
  - Action verb and contact completeness suggestions
- **Streamlit UI**:
  - Upload resume (PDF/DOCX)
  - Paste JD text
  - Analyze and display results
  - AI-powered resume rewrite with OpenAI API
  - Download updated resume as TXT/PDF

## Project Structure

```text
project/
│── app.py
│── requirements.txt
│── README.md
├── src/
│   ├── __init__.py
│   ├── parser.py
│   ├── ner.py
│   ├── ats_score.py
│   ├── similarity.py
│   ├── keywords.py
│   ├── suggestions.py
├── data/
│   ├── sample_resumes/
│   │   └── sample_resume.txt
│   ├── sample_jd/
│   │   └── software_engineer_jd.txt
└── outputs/
```

## Setup Instructions

1. Create and activate a virtual environment (recommended: Python 3.12):

```bash
python3.12 -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

If you used Python 3.13 and see errors like:
`numpy.dtype size changed, may indicate binary incompatibility`, force a clean reinstall:

```bash
pip uninstall -y numpy spacy thinc blis
pip install --no-cache-dir -r requirements.txt
```

If installation still fails on 3.13, use Python 3.12 for best binary wheel compatibility:

```bash
deactivate 2>/dev/null || true
rm -rf .venv
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install --no-cache-dir -r requirements.txt
```

3. Download spaCy English model:

```bash
python -m spacy download en_core_web_sm
```

4. Run the app:

```bash
streamlit run app.py
```

5. Open the local Streamlit URL shown in the terminal.

## Input/Output Contract

### Input
- Resume file: `.pdf` or `.docx`
- Job description: text

### Output JSON format

```json
{
  "ATS_score": 84.25,
  "Job_fit_score": 0.78,
  "matched_keywords": ["python", "nlp"],
  "missing_keywords": ["kubernetes"],
  "suggestions": [
    "Add missing JD keywords naturally in achievements and skills: kubernetes."
  ]
}
```

## AI Resume Rewrite (OpenAI)

After running analysis:

1. Enter your OpenAI API key in the sidebar.
2. Click **Generate Updated Resume**.
3. The app rewrites the resume with limited ATS-focused edits.
4. Download the updated resume as:
   - `updated_resume.txt`
   - `updated_resume.pdf`

The rewrite prompt enforces minimal truthful edits and avoids fabricated content.

## Notes

- The app attempts to use Sentence-BERT for semantic similarity and falls back to TF-IDF similarity if model loading fails.
- A text resume sample is included for reference. Use a PDF/DOCX resume in the UI for full workflow testing.
