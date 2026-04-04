import re
from typing import Dict, List, Tuple


ACTION_VERBS = {
    "achieved",
    "built",
    "created",
    "delivered",
    "designed",
    "developed",
    "drove",
    "enhanced",
    "executed",
    "implemented",
    "improved",
    "increased",
    "led",
    "managed",
    "optimized",
    "reduced",
    "streamlined",
}

SECTION_PATTERNS = {
    "contact": r"\b(contact|email|phone|linkedin)\b",
    "summary": r"\b(summary|profile|objective)\b",
    "experience": r"\b(experience|work history|employment)\b",
    "education": r"\b(education|academic)\b",
    "skills": r"\b(skills|technical skills|core competencies)\b",
    "projects": r"\b(projects|project experience)\b",
}


def _score_keyword_match(matched_keywords: List[str], jd_keywords: List[str]) -> float:
    if not jd_keywords:
        return 0.0
    return len(set(matched_keywords)) / max(len(set(jd_keywords)), 1)


def _score_section_presence(resume_text: str) -> Tuple[float, List[str]]:
    text = (resume_text or "").lower()
    present, missing = 0, []
    for section, pattern in SECTION_PATTERNS.items():
        if re.search(pattern, text):
            present += 1
        else:
            missing.append(section)
    return present / len(SECTION_PATTERNS), missing


def _score_formatting(resume_text: str) -> Tuple[float, List[str]]:
    lines = [ln for ln in (resume_text or "").splitlines() if ln.strip()]
    if not lines:
        return 0.0, ["Resume appears empty after parsing."]

    issues = []
    bullet_lines = sum(1 for ln in lines if re.match(r"^\s*[\-\*\u2022]", ln))
    long_lines = sum(1 for ln in lines if len(ln) > 140)
    weird_chars = len(re.findall(r"[^A-Za-z0-9\s\-\+\#\.\,\;\:\(\)\/@]", resume_text or ""))

    bullet_ratio = bullet_lines / max(len(lines), 1)
    if bullet_ratio < 0.05:
        issues.append("Use bullet points to improve ATS readability.")
    if long_lines > max(3, int(0.2 * len(lines))):
        issues.append("Some lines are too long; split into concise bullets.")
    if weird_chars > 20:
        issues.append("Remove unusual symbols that may hurt ATS parsing.")

    penalties = 0.0
    penalties += 0.25 if bullet_ratio < 0.05 else 0.0
    penalties += 0.35 if long_lines > max(3, int(0.2 * len(lines))) else 0.0
    penalties += 0.20 if weird_chars > 20 else 0.0
    score = max(0.0, 1.0 - penalties)
    return score, issues


def _score_action_verbs(resume_text: str) -> Tuple[float, int]:
    words = re.findall(r"[a-zA-Z]+", (resume_text or "").lower())
    if not words:
        return 0.0, 0
    verb_hits = sum(1 for w in words if w in ACTION_VERBS)
    target_hits = max(8, len(words) // 120)
    return min(1.0, verb_hits / target_hits), verb_hits


def _score_contact_info(resume_text: str) -> Tuple[float, List[str]]:
    text = resume_text or ""
    missing = []

    email_ok = bool(re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text))
    phone_ok = bool(re.search(r"(\+?\d[\d\-\s]{8,}\d)", text))
    linkedin_ok = "linkedin.com" in text.lower()

    if not email_ok:
        missing.append("Add a professional email address.")
    if not phone_ok:
        missing.append("Add a phone number in international format.")
    if not linkedin_ok:
        missing.append("Add a LinkedIn profile URL.")

    completed = sum([email_ok, phone_ok, linkedin_ok])
    return completed / 3.0, missing


def compute_ats_score(
    resume_text: str,
    jd_keywords: List[str],
    matched_keywords: List[str],
) -> Dict:
    """
    Weighted ATS scoring:
    - Keyword match: 30%
    - Section presence: 25%
    - Formatting: 20%
    - Action verbs: 15%
    - Contact completeness: 10%
    """
    keyword_score = _score_keyword_match(matched_keywords, jd_keywords)
    section_score, missing_sections = _score_section_presence(resume_text)
    formatting_score, formatting_issues = _score_formatting(resume_text)
    action_score, action_hits = _score_action_verbs(resume_text)
    contact_score, contact_issues = _score_contact_info(resume_text)

    final_0_to_1 = (
        0.30 * keyword_score
        + 0.25 * section_score
        + 0.20 * formatting_score
        + 0.15 * action_score
        + 0.10 * contact_score
    )
    final_0_to_100 = round(final_0_to_1 * 100, 2)

    return {
        "ATS_score": final_0_to_100,
        "diagnostics": {
            "keyword_score": round(keyword_score, 4),
            "section_score": round(section_score, 4),
            "formatting_score": round(formatting_score, 4),
            "action_verb_score": round(action_score, 4),
            "contact_score": round(contact_score, 4),
            "missing_sections": missing_sections,
            "formatting_issues": formatting_issues,
            "action_verb_hits": action_hits,
            "contact_issues": contact_issues,
        },
    }
