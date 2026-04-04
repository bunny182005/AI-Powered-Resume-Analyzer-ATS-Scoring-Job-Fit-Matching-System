import re
from typing import Dict, List, Optional


SKILL_TERMS = [
    "python",
    "java",
    "sql",
    "aws",
    "docker",
    "kubernetes",
    "tensorflow",
    "pytorch",
    "nlp",
    "machine learning",
    "deep learning",
    "data analysis",
    "streamlit",
    "scikit-learn",
    "spacy",
    "pandas",
    "numpy",
    "git",
    "rest api",
]

DEGREE_TERMS = [
    "bachelor",
    "master",
    "phd",
    "b.tech",
    "m.tech",
    "b.sc",
    "m.sc",
    "mba",
]

JOB_TITLE_TERMS = [
    "software engineer",
    "data scientist",
    "machine learning engineer",
    "nlp engineer",
    "data analyst",
    "backend developer",
    "full stack developer",
    "devops engineer",
]

CERTIFICATION_TERMS = [
    "aws certified",
    "google professional",
    "azure fundamentals",
    "pmp",
    "scrum master",
    "cfa",
]


def _try_import_spacy():
    try:
        import spacy  # type: ignore
        from spacy.pipeline import EntityRuler  # type: ignore

        return spacy, EntityRuler
    except Exception:
        return None, None


def _build_pipeline():
    """Build spaCy NLP pipeline with custom entity patterns."""
    spacy, EntityRuler = _try_import_spacy()
    if spacy is None:
        return None

    try:
        nlp = spacy.load("en_core_web_sm")
    except OSError:
        # Fallback if model is unavailable. The entity ruler still works.
        nlp = spacy.blank("en")

    if "entity_ruler" in nlp.pipe_names:
        nlp.remove_pipe("entity_ruler")

    ruler: EntityRuler = nlp.add_pipe(
        "entity_ruler", before="ner" if "ner" in nlp.pipe_names else None
    )
    patterns = []

    for term in SKILL_TERMS:
        patterns.append({"label": "SKILL", "pattern": term})
    for term in DEGREE_TERMS:
        patterns.append({"label": "DEGREE", "pattern": term})
    for term in JOB_TITLE_TERMS:
        patterns.append({"label": "JOB_TITLE", "pattern": term})
    for term in CERTIFICATION_TERMS:
        patterns.append({"label": "CERTIFICATION", "pattern": term})

    # COMPANY is approximated through common organization suffixes.
    company_suffixes = ["inc", "ltd", "llc", "corp", "technologies", "systems", "solutions"]
    for suffix in company_suffixes:
        patterns.append(
            {
                "label": "COMPANY",
                "pattern": [{"IS_TITLE": True, "OP": "+"}, {"LOWER": suffix}],
            }
        )

    ruler.add_patterns(patterns)
    return nlp


_NLP = _build_pipeline()


def _extract_with_regex(text: str) -> Dict[str, List[str]]:
    text_lc = (text or "").lower()
    grouped = {
        "SKILL": set(),
        "DEGREE": set(),
        "JOB_TITLE": set(),
        "COMPANY": set(),
        "CERTIFICATION": set(),
    }

    for term in SKILL_TERMS:
        if term in text_lc:
            grouped["SKILL"].add(term)
    for term in DEGREE_TERMS:
        if term in text_lc:
            grouped["DEGREE"].add(term)
    for term in JOB_TITLE_TERMS:
        if term in text_lc:
            grouped["JOB_TITLE"].add(term)
    for term in CERTIFICATION_TERMS:
        if term in text_lc:
            grouped["CERTIFICATION"].add(term)

    # Approximate company extraction from "Title Case ... suffix"
    for m in re.finditer(
        r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,4}\s+(?:Inc|Ltd|LLC|Corp|Technologies|Systems|Solutions))\b",
        text or "",
    ):
        grouped["COMPANY"].add(m.group(1))

    return {k: sorted(v) for k, v in grouped.items()}


def extract_entities(text: str) -> Dict[str, List[str]]:
    """Extract required entity groups from text."""
    if _NLP is None:
        return _extract_with_regex(text)

    doc = _NLP(text or "")
    entity_types = {"SKILL", "DEGREE", "JOB_TITLE", "COMPANY", "CERTIFICATION"}
    grouped = {label: set() for label in entity_types}

    for ent in doc.ents:
        if ent.label_ in grouped:
            grouped[ent.label_].add(ent.text.strip())

    return {k: sorted(v) for k, v in grouped.items()}
