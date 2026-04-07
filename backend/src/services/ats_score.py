import os
import json
import re
import numpy as np
from dotenv import load_dotenv
from openai import OpenAI
from sklearn.metrics.pairwise import cosine_similarity

# Import our custom domain services
from src.services.similarity import vector_service
from src.services.ner import ner_service
from src.services.redaction import redaction_service
from src.services.github import github_verifier

load_dotenv()

class ATSScoringService:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is missing from .env file")
        self.client = OpenAI(api_key=api_key)

    def _extract_deep_resume_skills(self, resume_text: str) -> list:
        """SEMANTIC DOCUMENT EXPANSION"""
        prompt = f"""
        Analyze this candidate's resume thoroughly as a Senior Technical Recruiter.
        
        Your job is "Semantic Skill Expansion".
        1. Extract EVERY explicitly mentioned technical skill, language, framework, and tool.
        2. Look deeply at the 'Projects' and 'Experience'. For every project, reverse-engineer the tech stack and output BOTH the specific tools AND the broad engineering categories they fall under.
        
        CRITICAL RULES FOR EXPANSION:
        - If they mention building a "Full Stack" app, "MERN", or using "Node.js/Express", explicitly add: "Backend development", "Frontend development", and "Scalable architectures".
        - If they mention "JWT", "OAuth", "RBAC", explicitly add: "Authentication systems", "Authorization", and "Secure system design".
        - If they mention "AWS", "Firebase", or "Kubernetes", explicitly add: "Cloud infrastructure".
        - If they mention "LLaMA", "GPT", or "Ollama", explicitly add: "LLMs", "Local/offline models", and "Large Language Models".
        - If they mention "Docker", explicitly add: "Docker" and "Containerization".
           
        Return STRICTLY a JSON object with a single key "skills" containing a flat list of strings.
        DO NOT limit the number of skills. Over-generate broad categories, synonyms, and inferred tech stacks.
        
        Resume Text: {resume_text[:4000]}
        """
        response = self.client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You output strict JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={ "type": "json_object" },
            temperature=0.3
        )
        
        data = json.loads(response.choices[0].message.content)
        return data.get("skills", [])

    def _semantic_keyword_match(self, jd_skills: list, resume_skills: list, resume_text: str) -> dict:
        """
        THE ULTIMATE HYBRID MATCHER: 
        Pass 0: Regex-Normalized Raw text match (Defeats PDF hidden characters).
        Pass 1: Array Substring match.
        Pass 2: Vector similarity fallback (0.55 threshold).
        """
        if not jd_skills:
            return {"score": 0.0, "matched": [], "missing": [], "total": 0}

        matched_skills = []
        missing_skills = []
        unmatched_jd = []

        # REGEX NORMALIZATION: Strips all punctuation and hidden PDF newlines
        clean_resume_text = re.sub(r'[^a-z0-9]', ' ', resume_text.lower())
        resume_skills_clean = [s.strip().lower() for s in resume_skills]

        for jd_wordRaw in jd_skills:
            jd_word = jd_wordRaw.strip()
            jd_lower = jd_word.lower()
            jd_singular = jd_lower[:-1] if jd_lower.endswith('s') else jd_lower
            
            # Normalize the JD word to match the clean text format
            clean_jd = re.sub(r'[^a-z0-9]', ' ', jd_lower).strip()
            clean_singular = re.sub(r'[^a-z0-9]', ' ', jd_singular).strip()

            # PASS 0: Regex-Normalized Raw Text Override
            if clean_jd in clean_resume_text or (clean_singular and clean_singular in clean_resume_text):
                matched_skills.append(jd_word)
                continue
                
            # PASS 1: Array Substring Match
            match_found = False
            for r_word in resume_skills_clean:
                if len(r_word) < 3: 
                    if jd_lower == r_word:
                        matched_skills.append(jd_word)
                        match_found = True
                        break
                else:
                    if jd_lower in r_word or r_word in jd_lower or jd_singular in r_word:
                        matched_skills.append(jd_word)
                        match_found = True
                        break
                    
            if not match_found:
                unmatched_jd.append(jd_word)

        # PASS 2: Vector Semantic Fallback
        if unmatched_jd and resume_skills:
            jd_vectors = vector_service.embedding_fn(unmatched_jd)
            resume_vectors = vector_service.embedding_fn(resume_skills)
            similarity_matrix = cosine_similarity(jd_vectors, resume_vectors)

            threshold = 0.55 

            for i, jd_word in enumerate(unmatched_jd):
                if np.max(similarity_matrix[i]) >= threshold:
                    matched_skills.append(jd_word)
                else:
                    missing_skills.append(jd_word)
        elif unmatched_jd:
            missing_skills.extend(unmatched_jd)

        score = (len(matched_skills) / len(jd_skills)) * 100
        return {
            "score": score,
            "matched": list(set(matched_skills)), 
            "missing": list(set(missing_skills)),
            "total": len(set(jd_skills))
        }

    def _get_llm_evaluation(self, resume_text: str, jd_text: str) -> dict:
        prompt = f"""
        You are an expert recruiter AI. 
        Job Description: {jd_text[:1000]}
        Resume: {resume_text[:2000]}

        Return JSON exactly:
        {{
            "llm_score": float between 0-100 for qualitative fit,
            "recommendations": [list of 2 actionable improvements]
        }}
        """
        response = self.client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "system", "content": "You output strict JSON."}, {"role": "user", "content": prompt}],
            response_format={ "type": "json_object" },
            temperature=0.2
        )
        return json.loads(response.choices[0].message.content)

    def analyze_application(self, resume_text: str, jd_text: str, jd_id: str = "default_jd", blind_hiring: bool = False) -> dict:
        # NOTE: blind_hiring is now set to False by default so the redactor doesn't delete your skills!
        if blind_hiring:
            resume_text = redaction_service.anonymize_resume(resume_text)

        # 1. Get JD Keywords
        extraction_prompt = f"""
        Extract EVERY SINGLE technical hard skill, tool, framework, and requirement from this job description: {jd_text[:2000]}
        Return STRICTLY a JSON object with a single key "skills" containing a list of strings.
        Exclude soft skills.
        """
        jd_response = self.client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You output strict JSON."},
                {"role": "user", "content": extraction_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        jd_data = json.loads(jd_response.choices[0].message.content)
        jd_keywords = jd_data.get("skills", [])
        
        # 2. Get DEEP Resume Keywords (Semantic Expansion)
        resume_keywords = self._extract_deep_resume_skills(resume_text)

        # 3. Hybrid Keyword Precision
        keyword_data = self._semantic_keyword_match(jd_keywords, resume_keywords, resume_text)
        
        # 4. Sentence-Level Semantic RAG
        jd_sentences = [s.strip() for s in jd_text.split('.') if len(s.strip()) > 10]
        vector_service.store_jd_requirements(jd_id, jd_sentences)
        resume_sentences = [s.strip() for s in resume_text.split('.') if len(s.strip()) > 10]
        semantic_score = vector_service.calculate_semantic_match(jd_id, resume_sentences)
        normalized_semantic = min(100.0, semantic_score * 2.0)

        # 5. LLM Reasoning
        llm_eval = self._get_llm_evaluation(resume_text, jd_text)
        
        # 6. Final Score Calculation
        final_score = (keyword_data["score"] * 0.50) + (normalized_semantic * 0.20) + (llm_eval.get("llm_score", 0) * 0.30)
        
        return {
            "match_score": round(final_score, 1),
            "keyword_metrics": {
                "matched": keyword_data["matched"],
                "missing": keyword_data["missing"],
                "total": keyword_data["total"]
            },
            "recommendations": llm_eval.get("recommendations", [])
        }

ats_scorer = ATSScoringService()