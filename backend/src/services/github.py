import re
import requests
import logging

class GitHubVerifier:
    def __init__(self):
        self.base_url = "https://api.github.com/users/"

    def extract_github_username(self, text: str) -> str:
        """Finds a GitHub URL in the resume and extracts the username."""
        # Regex to find github.com/[username]
        match = re.search(r'github\.com/([a-zA-Z0-9-]+)', text)
        if match:
            return match.group(1)
        return None

    def fetch_user_languages(self, username: str) -> dict:
        """Fetches the primary languages used across the user's public repositories."""
        try:
            # Note: Unauthenticated GitHub API has a limit of 60 requests/hour.
            # For production, you would pass a GitHub Personal Access Token in the headers.
            response = requests.get(f"{self.base_url}{username}/repos?sort=updated&per_page=10")
            
            if response.status_code != 200:
                logging.warning(f"Failed to fetch GitHub data for {username}. Rate limit or invalid user.")
                return {"verified_languages": []}

            repos = response.json()
            languages = set()
            
            for repo in repos:
                if repo.get("language"):
                    languages.add(repo["language"].lower())

            return {"verified_languages": list(languages)}
            
        except Exception as e:
            logging.error(f"GitHub Scraper Error: {e}")
            return {"verified_languages": []}

# Export singleton
github_verifier = GitHubVerifier()