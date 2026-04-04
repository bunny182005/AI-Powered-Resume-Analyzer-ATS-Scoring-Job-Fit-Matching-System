import json
import os
import tempfile
import time
import sys
from uuid import uuid4
from io import BytesIO
from pathlib import Path
import streamlit as st

from src.ats_score import compute_ats_score
from src.keywords import extract_top_keywords, match_keywords
from src.ner import extract_entities
from src.parser import extract_resume_text
from src.similarity import compute_job_fit_score
from src.suggestions import generate_suggestions

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    # dotenv is optional; app still works with system env vars.
    pass
DEBUG_LOG_PATH = "/Users/srinivasaraomedikonduru/Desktop/new/.cursor/debug-13c7d4.log"
DEBUG_SESSION_ID = "13c7d4"


def _debug_log(run_id: str, hypothesis_id: str, location: str, message: str, data: dict) -> None:
    payload = {
        "sessionId": DEBUG_SESSION_ID,
        "id": f"log_{int(time.time() * 1000)}_{uuid4().hex[:8]}",
        "timestamp": int(time.time() * 1000),
        "runId": run_id,
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
    }
    try:
        with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=True) + "\n")
    except Exception:
        pass

st.set_page_config(page_title="AI Resume ATS Analyzer", page_icon="📄", layout="wide")
st.title("AI-Powered Resume Analysis, ATS Scoring & Job Fit Matching")

st.markdown(
    "Upload a resume (`PDF` or `DOCX`) and paste a job description to receive ATS and semantic fit analysis."
)

uploaded_file = st.file_uploader("Upload Resume", type=["pdf", "docx"])
job_description = st.text_area("Paste Job Description", height=220, placeholder="Enter job description text...")
openai_api_key = os.getenv("OPEN_API_KEY")
openai_model = st.sidebar.text_input("OpenAI Model", value="gpt-4o-mini")


def run_analysis(resume_path: str, jd_text: str) -> dict:
    resume_text = extract_resume_text(resume_path)
    jd_text = (jd_text or "").strip()
    if not jd_text:
        raise ValueError("Job description cannot be empty.")

    jd_keywords = extract_top_keywords(jd_text, top_n=30)
    matched_keywords, missing_keywords = match_keywords(resume_text, jd_keywords)
    ats_output = compute_ats_score(
        resume_text=resume_text, jd_keywords=jd_keywords, matched_keywords=matched_keywords
    )
    job_fit_score = compute_job_fit_score(resume_text, jd_text)
    entities = extract_entities(resume_text)
    suggestions = generate_suggestions(missing_keywords, ats_output["diagnostics"])

    return {
        "ATS_score": ats_output["ATS_score"],
        "Job_fit_score": job_fit_score,
        "matched_keywords": matched_keywords,
        "missing_keywords": missing_keywords,
        "suggestions": suggestions,
        "entities": entities,
        "diagnostics": ats_output["diagnostics"],
    }


def generate_updated_resume_text(
    original_resume_text: str,
    jd_text: str,
    analysis_result: dict,
    api_key: str,
    model_name: str,
) -> str:
    """Use OpenAI API to produce a minimally edited, JD-aligned resume text."""
    if not api_key:
        raise ValueError("OpenAI API key is required to generate updated resume.")

    try:
        from openai import OpenAI
    except Exception as exc:
        raise ImportError("OpenAI package missing. Install with: pip install openai") from exc

    client = OpenAI(api_key=api_key)

    missing_keywords = analysis_result.get("missing_keywords", [])
    suggestions = analysis_result.get("suggestions", [])
    matched_keywords = analysis_result.get("matched_keywords", [])

    system_prompt = """
You are an elite ATS resume editor and career writing assistant.
Your task is to rewrite the resume with MINIMAL changes while improving ATS alignment.

Strict rules:
1) Keep the candidate's original identity, career timeline, and factual content unchanged.
2) Do NOT invent employers, dates, degrees, certifications, metrics, or tools not present in input.
3) Make targeted edits only to improve wording, impact, and keyword integration.
4) YOU MUST OUTPUT THE RESUME IN STRICT MARKDOWN FORMAT. 
   - Use # for the candidate's name.
   - Put contact information (email, phone, links) immediately below the name.
   - Use ## for main sections (EDUCATION, TECHNICAL SKILLS, EXPERIENCE, PROJECTS, CERTIFICATIONS).
   - Use **bold** for Job Titles, Degrees, and Project Names.
   - Use standard bullet points (-) for all descriptions.
5) Return ONLY the markdown text (no markdown fences, no commentary).
"""

    user_prompt = f"""
Job Description:
{jd_text}

Current Analysis:
- Matched keywords: {matched_keywords}
- Missing keywords: {missing_keywords}
- Suggestions: {suggestions}

Original Resume:
{original_resume_text}

Now produce an updated resume text with limited, high-value edits for better ATS/job-fit.
"""

    response = client.chat.completions.create(
        model=model_name,
        temperature=0.2,
        messages=[
            {"role": "system", "content": system_prompt.strip()},
            {"role": "user", "content": user_prompt.strip()},
        ],
    )
    content = (response.choices[0].message.content or "").strip()
    if not content:
        raise ValueError("OpenAI returned empty content.")
    return content


def resume_text_to_pdf_bytes(resume_text: str) -> bytes:
    """Render markdown resume text into a styled PDF."""
    try:
        import markdown
        from xhtml2pdf import pisa
    except Exception as exc:
        raise ImportError(
            "markdown and xhtml2pdf are required for formatted PDF download. "
            "Install with: pip install markdown xhtml2pdf"
        ) from exc

    # Convert LLM Markdown output to HTML
    html_content = markdown.markdown(resume_text)

    # CSS to match the original "Karthik CV" ATS pattern
    css = """
    <style>
        @page { 
            margin: 0.5in; 
            size: letter;
        }
        body { 
            font-family: Helvetica, Arial, sans-serif; 
            font-size: 10pt; 
            color: #111; 
            line-height: 1.3; 
        }
        h1 { 
            font-size: 18pt; 
            text-align: center; 
            margin-bottom: 2px; 
            color: #000; 
            text-transform: uppercase;
        }
        h2 { 
            font-size: 11pt; 
            border-bottom: 1px solid #000; 
            padding-bottom: 2px; 
            margin-top: 12px; 
            margin-bottom: 6px; 
            color: #000; 
            text-transform: uppercase; 
        }
        p { 
            margin: 2px 0; 
        }
        ul { 
            margin-top: 2px; 
            margin-bottom: 6px; 
            padding-left: 20px; 
        }
        li { 
            margin-bottom: 3px; 
        }
        strong { 
            color: #000; 
            font-weight: bold;
        }
        /* Target the first paragraph (usually contact info) to center it */
        h1 + p {
            text-align: center;
            font-size: 9.5pt;
            margin-bottom: 15px;
        }
    </style>
    """

    # Wrap the content in basic HTML structure
    full_html = f"<html><head>{css}</head><body>{html_content}</body></html>"

    buffer = BytesIO()
    
    # Generate PDF
    pisa_status = pisa.CreatePDF(full_html, dest=buffer)

    if pisa_status.err:
        raise Exception(f"PDF generation failed with errors: {pisa_status.err}")

    buffer.seek(0)
    return buffer.getvalue()

if "analysis_result" not in st.session_state:
    st.session_state.analysis_result = None
if "resume_text" not in st.session_state:
    st.session_state.resume_text = ""
if "updated_resume_text" not in st.session_state:
    st.session_state.updated_resume_text = ""


if st.button("Analyze", type="primary"):
    if uploaded_file is None:
        st.error("Please upload a resume file.")
    elif not (job_description or "").strip():
        st.error("Please provide a job description.")
    else:
        tmp_path = None
        try:
            suffix = Path(uploaded_file.name).suffix.lower()
            # region agent log
            _debug_log(
                "repro-pdf-1",
                "H5",
                "app.py:analyze_button",
                "Analyze triggered",
                {"suffix": suffix, "python_executable": sys.executable},
            )
            # endregion
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(uploaded_file.read())
                tmp_path = tmp.name

            result = run_analysis(tmp_path, job_description)
            st.session_state.analysis_result = result
            st.session_state.resume_text = extract_resume_text(tmp_path)
            st.session_state.updated_resume_text = ""

        except Exception as exc:
            # region agent log
            _debug_log(
                "repro-pdf-1",
                "H5",
                "app.py:analyze_exception",
                "Analysis failed in app",
                {"error_type": type(exc).__name__, "error_message": str(exc)},
            )
            # endregion
            st.error(f"Analysis failed: {exc}")


result = st.session_state.analysis_result
if result:
    c1, c2 = st.columns(2)
    with c1:
        st.metric("ATS Score (0-100)", f"{result['ATS_score']}")
    with c2:
        st.metric("Job Fit Score (0-1)", f"{result['Job_fit_score']}")

    st.subheader("Matched Keywords")
    st.write(result["matched_keywords"] or ["No strong matches found."])

    st.subheader("Missing Keywords")
    st.write(result["missing_keywords"] or ["No critical keywords missing."])

    st.subheader("Improvement Suggestions")
    for item in result["suggestions"]:
        st.write(f"- {item}")

    with st.expander("Extracted Entities"):
        st.json(result["entities"])

    with st.expander("Diagnostics"):
        st.json(result["diagnostics"])

    output_payload = {
        "ATS_score": result["ATS_score"],
        "Job_fit_score": result["Job_fit_score"],
        "matched_keywords": result["matched_keywords"],
        "missing_keywords": result["missing_keywords"],
        "suggestions": result["suggestions"],
    }
    st.subheader("Structured JSON Output")
    st.code(json.dumps(output_payload, indent=2), language="json")

    st.divider()
    st.subheader("AI Resume Rewrite")
    st.caption("Uses OpenAI to make limited, high-value resume edits aligned to the JD.")

    if st.button("Generate Updated Resume"):
        try:
            updated_text = generate_updated_resume_text(
                original_resume_text=st.session_state.resume_text,
                jd_text=job_description,
                analysis_result=result,
                api_key=openai_api_key.strip(),
                model_name=openai_model.strip() or "gpt-4o-mini",
            )
            st.session_state.updated_resume_text = updated_text
            st.success("Updated resume generated.")
        except Exception as exc:
            st.error(f"Resume generation failed: {exc}")

    if st.session_state.updated_resume_text:
        st.text_area(
            "Updated Resume (Editable)",
            value=st.session_state.updated_resume_text,
            height=420,
            key="updated_resume_editor",
        )

        resume_download_text = st.session_state.get(
            "updated_resume_editor", st.session_state.updated_resume_text
        )
        pdf_bytes = None
        pdf_error = None
        try:
            pdf_bytes = resume_text_to_pdf_bytes(resume_download_text)
        except Exception as exc:
            pdf_error = str(exc)

        d1, d2 = st.columns(2)
        with d1:
            st.download_button(
                "Download Updated Resume (.txt)",
                data=resume_download_text.encode("utf-8"),
                file_name="updated_resume.txt",
                mime="text/plain",
            )
        with d2:
            if pdf_bytes is not None:
                st.download_button(
                    "Download Updated Resume (.pdf)",
                    data=pdf_bytes,
                    file_name="updated_resume.pdf",
                    mime="application/pdf",
                )
            else:
                st.info(pdf_error or "PDF export unavailable.")
