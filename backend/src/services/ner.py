import spacy
from typing import Dict, List

class NERService:
    def __init__(self):
        # Load a medium-sized model for better accuracy than the 'sm' model
        self.nlp = spacy.load("en_core_web_md")

    def extract_entities(self, text: str) -> Dict[str, List[str]]:
        doc = self.nlp(text)
        
        entities = {
            "ORG": [],    # Companies/Universities
            "GPE": [],    # Locations
            "DATE": [],   # Years of experience/graduation
            "SKILLS": []  # We will enhance this with a custom ruler later
        }

        for ent in doc.ents:
            if ent.label_ in entities:
                entities[ent.label_].append(ent.text)
        
        # Clean up duplicates
        return {k: list(set(v)) for k, v in entities.items()}

# Singleton instance for the app
ner_service = NERService()