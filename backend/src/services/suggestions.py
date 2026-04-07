import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

class SuggestionService:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is missing from .env file")
        self.client = OpenAI(api_key=api_key)

    def rewrite_bullet_star(self, original_bullet: str, jd_text: str) -> dict:
        # FIX 1: Properly indented the try block
        try:
            prompt = f"""
You are an expert technical recruiter and resume writer. 

Original bullet:
"{original_bullet}"

Job Description:
"{jd_text[:1500]}"

Return ONLY valid JSON:
{{
  "critique": "short explanation",
  "star_rewrite": "improved bullet point"
}}
"""

            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                # PRO-TIP: Force the model to return valid JSON using response_format
                response_format={"type": "json_object"},
                messages=[
                    # Note: You MUST mention "JSON" in the system prompt when using json_object mode
                    {"role": "system", "content": "You are a helpful assistant designed to output JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
            )

            content = response.choices[0].message.content

            # 🔥 SAFETY CLEAN
            if not content:
                return {
                    "critique": "Could not generate critique",
                    "star_rewrite": original_bullet
                }

            content = content.strip()

            # Remove markdown blocks if the model still accidentally includes them
            if "```" in content:
                content = content.replace("```json", "").replace("```", "").strip()

            try:
                return json.loads(content)
            except Exception:
                print("⚠️ JSON PARSE FAILED:", content)
                return {
                    "critique": "AI response parsing failed",
                    "star_rewrite": original_bullet
                }

        # FIX 1 (cont.): Properly aligned the except block with the try block
        except Exception as e:
            print("🔥 SUGGESTION ERROR:", str(e))
            return {
                "critique": "Error generating suggestion",
                "star_rewrite": original_bullet
            }


# FIX 2: Safe Singleton Export
# By wrapping this in a try/except, your app will still start up successfully 
# even if the OPENAI_API_KEY is missing, allowing you to handle the missing 
# dependency gracefully rather than crashing the server.
suggestion_service = None
try:
    suggestion_service = SuggestionService()
except ValueError as e:
    print(f"⚠️ WARNING: {str(e)}. SuggestionService will be disabled.")