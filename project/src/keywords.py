import re
from functools import lru_cache
from typing import List, Tuple, Set

from sklearn.feature_extraction.text import TfidfVectorizer


def _stem_light(token: str) -> str:
    """
    Lightweight stemmer to reduce plural/verb variants.
    Avoids extra heavy dependencies.
    """
    t = token
    if len(t) > 4 and t.endswith("ing"):
        t = t[:-3]
    elif len(t) > 3 and t.endswith("ed"):
        t = t[:-2]
    elif len(t) > 3 and t.endswith("es"):
        t = t[:-2]
    elif len(t) > 2 and t.endswith("s"):
        t = t[:-1]
    return t


def normalize_token(token: str) -> str:
    token = token.lower().strip()
    token = re.sub(r"[^a-z0-9\+\#\. ]", "", token)
    token = re.sub(r"\s+", " ", token)
    return token


def tokenize_for_matching(text: str) -> List[str]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9\+\#\.\-]{1,}", (text or "").lower())
    return [normalize_token(w) for w in words if normalize_token(w)]


def _normalize_phrase(phrase: str) -> str:
    p = normalize_token(phrase.replace("-", " "))
    parts = [w for w in p.split() if w]
    stemmed = [_stem_light(w) for w in parts]
    return " ".join(stemmed).strip()


def _extract_resume_phrases(resume_text: str) -> Set[str]:
    """
    Build normalized unigram/bigram concept candidates from resume.
    This is generic normalization (no manual synonym list).
    """
    tokens = tokenize_for_matching(resume_text or "")
    norm_tokens = [_normalize_phrase(t) for t in tokens if _normalize_phrase(t)]
    phrases: Set[str] = set(norm_tokens)
    for i in range(len(norm_tokens) - 1):
        phrases.add(f"{norm_tokens[i]} {norm_tokens[i + 1]}")
    return {p for p in phrases if p}


@lru_cache(maxsize=1)
def _load_sentence_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer("all-mpnet-base-v2")


def _embedding_semantic_match(keyword: str, resume_phrases: List[str], threshold: float = 0.66) -> bool:
    if not resume_phrases:
        return False
    try:
        from sklearn.metrics.pairwise import cosine_similarity

        model = _load_sentence_model()
        kw_vec = model.encode([keyword], normalize_embeddings=True)
        cand_vecs = model.encode(resume_phrases, normalize_embeddings=True)
        best = float(cosine_similarity(kw_vec, cand_vecs).max())
        return best >= threshold
    except Exception:
        return False


def _overlap_fallback_match(keyword: str, resume_phrases: Set[str]) -> bool:
    kw = _normalize_phrase(keyword)
    if not kw:
        return False

    if kw in resume_phrases:
        return True

    kw_tokens = [t for t in kw.split() if t]
    if not kw_tokens:
        return False

    # Soft lexical overlap fallback when embedding model is unavailable.
    for cand in resume_phrases:
        cand_tokens = set(cand.split())
        inter = len(set(kw_tokens) & cand_tokens)
        if inter / max(len(set(kw_tokens)), 1) >= 0.6:
            return True
    return False


def extract_top_keywords(text: str, top_n: int = 30) -> List[str]:
    """Extract top keywords/phrases from JD with TF-IDF."""
    clean = (text or "").strip()
    if not clean:
        return []

    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        stop_words="english",
        max_features=2000,
    )
    matrix = vectorizer.fit_transform([clean])
    scores = matrix.toarray()[0]
    features = vectorizer.get_feature_names_out()

    ranked = sorted(zip(features, scores), key=lambda x: x[1], reverse=True)
    keywords = [normalize_token(k) for k, s in ranked if s > 0][:top_n]
    return list(dict.fromkeys([k for k in keywords if k]))


def match_keywords(resume_text: str, jd_keywords: List[str]) -> Tuple[List[str], List[str]]:
    resume_phrases = _extract_resume_phrases(resume_text or "")
    resume_phrase_list = sorted(resume_phrases)
    matched, missing = [], []
    for kw in jd_keywords:
        if not kw:
            continue
        kw_norm = _normalize_phrase(kw)
        if not kw_norm:
            continue

        if _overlap_fallback_match(kw_norm, resume_phrases) or _embedding_semantic_match(
            kw_norm, resume_phrase_list
        ):
            matched.append(kw)
        else:
            missing.append(kw)
    return sorted(set(matched)), sorted(set(missing))
