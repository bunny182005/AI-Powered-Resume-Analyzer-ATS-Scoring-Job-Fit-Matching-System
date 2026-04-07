import os
import chromadb
from chromadb.utils import embedding_functions
from sentence_transformers import SentenceTransformer, util

class VectorSearchService:
    def __init__(self):
        os.makedirs("./data/chroma_db", exist_ok=True)
        self.client = chromadb.PersistentClient(path="./data/chroma_db")
        
        # We use this to embed paragraphs into ChromaDB
        self.embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
        
        # We use this directly to compare individual keywords/skills instantly
        self.model = SentenceTransformer("all-MiniLM-L6-v2")
        
    def _get_or_create_collection(self, collection_name: str):
        return self.client.get_or_create_collection(name=collection_name, embedding_function=self.embedding_fn)

    def store_jd_requirements(self, jd_id: str, requirements: list[str]):
        collection = self._get_or_create_collection(f"jd_{jd_id}")
        ids = [f"req_{i}" for i in range(len(requirements))]
        collection.upsert(documents=requirements, ids=ids)
        return len(requirements)

    def calculate_semantic_match(self, jd_id: str, resume_sentences: list[str]) -> float:
        """Paragraph-level semantic matching."""
        collection = self._get_or_create_collection(f"jd_{jd_id}")
        if collection.count() == 0: return 0.0
        results = collection.query(query_texts=resume_sentences, n_results=1)
        distances = [sublist[0] for sublist in results['distances'] if sublist and sublist[0] is not None]
        if not distances: return 0.0
        
        avg_distance = sum(distances) / len(distances)
        # Normalize distance to a 0.0 - 1.0 scale
        match_score = max(0.0, 1.0 - (avg_distance / 2.0))
        return round(match_score, 2)

    def match_skills_semantically(self, jd_skills: list[str], resume_skills: list[str], threshold: float = 0.65) -> dict:
        """
        The Magic Bullet: Compares skills mathematically.
        If JD asks for 'AI/ML' and resume says 'Artificial Intelligence', 
        the cosine similarity will be high enough to pass the threshold.
        """
        if not jd_skills or not resume_skills:
            return {"score": 0.0, "matched": [], "missing": jd_skills}

        # Convert words into Vector Math
        jd_embeddings = self.model.encode(jd_skills)
        resume_embeddings = self.model.encode(resume_skills)

        # Calculate mathematical closeness (Cosine Similarity)
        cosine_scores = util.cos_sim(jd_embeddings, resume_embeddings)

        matched_skills = []
        missing_skills = []

        # Check each JD skill against all Resume skills
        for i, jd_skill in enumerate(jd_skills):
            best_match_score = cosine_scores[i].max().item()
            
            # If the mathematical meaning is close enough, it's a match!
            if best_match_score >= threshold:
                matched_skills.append(jd_skill)
            else:
                missing_skills.append(jd_skill)

        score = len(matched_skills) / len(jd_skills)
        return {"score": round(score, 2), "matched": matched_skills, "missing": missing_skills}

vector_service = VectorSearchService()