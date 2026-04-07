from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
import logging

class RedactionService:
    def __init__(self):
        # Initialize the Microsoft Presidio engines
        try:
            self.analyzer = AnalyzerEngine()
            self.anonymizer = AnonymizerEngine()
        except Exception as e:
            logging.error(f"Failed to load Presidio Engine. Did you download the spacy model? {e}")
            raise

    def anonymize_resume(self, text: str) -> str:
        """
        Scans the resume for Personally Identifiable Information (PII)
        and replaces it with generic tags (e.g., <PERSON>, <EMAIL_ADDRESS>).
        """
        # Define the exact entities we want to hide from the AI to prevent bias
        target_entities = ["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "LOCATION"]
        
        # Analyze the text
        results = self.analyzer.analyze(
            text=text,
            entities=target_entities,
            language='en'
        )
        
        # Anonymize the text based on the findings
        anonymized_result = self.anonymizer.anonymize(
            text=text, 
            analyzer_results=results
        )
        
        return anonymized_result.text

# Export singleton
redaction_service = RedactionService()