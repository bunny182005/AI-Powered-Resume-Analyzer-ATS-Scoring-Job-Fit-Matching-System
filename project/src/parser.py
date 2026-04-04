import re
import json
import time
import sys
from uuid import uuid4
from pathlib import Path
from typing import Optional

SUPPORTED_EXTENSIONS = {".pdf", ".docx"}
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


def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from a PDF file using PyMuPDF."""
    # region agent log
    _debug_log(
        "repro-pdf-1",
        "H1",
        "src/parser.py:extract_text_from_pdf",
        "Entered PDF extraction",
        {"python_executable": sys.executable},
    )
    # endregion
    try:
        import fitz  # type: ignore
        # region agent log
        _debug_log(
            "repro-pdf-1",
            "H1",
            "src/parser.py:extract_text_from_pdf",
            "Imported fitz",
            {"import_target": "fitz"},
        )
        # endregion
    except Exception:
        # region agent log
        _debug_log(
            "repro-pdf-1",
            "H2",
            "src/parser.py:extract_text_from_pdf",
            "fitz import failed, trying pymupdf",
            {"import_target": "fitz"},
        )
        # endregion
        try:
            import pymupdf as fitz  # type: ignore
            # region agent log
            _debug_log(
                "repro-pdf-1",
                "H2",
                "src/parser.py:extract_text_from_pdf",
                "Imported pymupdf fallback",
                {"import_target": "pymupdf"},
            )
            # endregion
        except Exception as exc:
            # region agent log
            _debug_log(
                "repro-pdf-1",
                "H3",
                "src/parser.py:extract_text_from_pdf",
                "Both fitz and pymupdf import failed",
                {"error_type": type(exc).__name__, "error_message": str(exc)},
            )
            # endregion
            # Fallback parser when PyMuPDF import is unavailable.
            try:
                from pypdf import PdfReader  # type: ignore

                reader = PdfReader(file_path)
                return "\n".join([(page.extract_text() or "") for page in reader.pages]).strip()
            except Exception as pypdf_exc:
                raise ImportError(
                    "PDF parsing requires PyMuPDF or pypdf. Install with: pip install PyMuPDF pypdf"
                ) from pypdf_exc

    text_chunks = []
    with fitz.open(file_path) as doc:
        # region agent log
        _debug_log(
            "repro-pdf-1",
            "H4",
            "src/parser.py:extract_text_from_pdf",
            "Opened PDF successfully",
            {"page_count": len(doc)},
        )
        # endregion
        for page in doc:
            text_chunks.append(page.get_text("text"))
    return "\n".join(text_chunks).strip()


def extract_text_from_docx(file_path: str) -> str:
    """Extract text from a DOCX file using python-docx."""
    try:
        import docx  # type: ignore
    except Exception as exc:
        raise ImportError(
            "python-docx is required for DOCX parsing. Install with: pip install python-docx"
        ) from exc

    document = docx.Document(file_path)
    paragraphs = [p.text for p in document.paragraphs if p.text and p.text.strip()]
    return "\n".join(paragraphs).strip()


def clean_text(text: Optional[str]) -> str:
    """Normalize whitespace and remove noisy characters."""
    if not text:
        return ""
    cleaned = text.replace("\u00a0", " ")
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[^\x09\x0A\x0D\x20-\x7E]", "", cleaned)
    return cleaned.strip()


def extract_resume_text(file_path: str) -> str:
    """
    Extract and clean text from supported resume formats.
    Supports: PDF, DOCX.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file format: {suffix}. Supported formats are: {SUPPORTED_EXTENSIONS}"
        )

    if suffix == ".pdf":
        raw = extract_text_from_pdf(file_path)
    else:
        raw = extract_text_from_docx(file_path)

    return clean_text(raw)
