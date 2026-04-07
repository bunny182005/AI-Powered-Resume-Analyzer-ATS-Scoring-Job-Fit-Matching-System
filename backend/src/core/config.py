from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "sqlite:///./optmatch.db"
    secret_key: str = "change-this-in-production-supersecretkey"
    algorithm: str = "HS256"
    openai_api_key: str 
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()