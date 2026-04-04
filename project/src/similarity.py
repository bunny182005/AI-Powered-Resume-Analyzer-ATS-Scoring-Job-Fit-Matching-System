from functools import lru_cache

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


@lru_cache(maxsize=1)
def _load_sentence_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer("all-mpnet-base-v2")


def compute_job_fit_score(resume_text: str, jd_text: str) -> float:
    """
    Compute semantic similarity in [0,1].
    Uses sentence-transformers, with TF-IDF fallback.
    """
    resume_text = (resume_text or "").strip()
    jd_text = (jd_text or "").strip()
    if not resume_text or not jd_text:
        return 0.0

    try:
        model = _load_sentence_model()
        embeddings = model.encode([resume_text, jd_text], normalize_embeddings=True)
        sim = float(cosine_similarity([embeddings[0]], [embeddings[1]])[0][0])
    except Exception:
        vectorizer = TfidfVectorizer(stop_words="english")
        vec = vectorizer.fit_transform([resume_text, jd_text])
        sim = float(cosine_similarity(vec[0], vec[1])[0][0])

    if sim < 0:
        return 0.0
    if sim > 1:
        return 1.0
    return round(sim, 4)
