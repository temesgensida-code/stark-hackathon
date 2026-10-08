"""Settings loaded from environment variables (see .env.example)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../../.env"), extra="ignore")

    database_url: str = "sqlite:///./braille_talks.db"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://localhost:3000"

    scholarxiv_api_key: str = ""
    scholarxiv_api_url: str = "https://www.scholarxiv.com/api/v1"

    llm_base_url: str = "https://www.scholarxiv.com/api/v1/router"
    llm_api_key: str = ""  # empty = reuse SCHOLARXIV_API_KEY (Router uses the same sxv_ key)
    llm_model: str = "auto"

    # "inline" parses in a FastAPI background task; "rq" pushes the job to the Redis worker.
    job_backend: str = "inline"
    upload_dir: str = "uploads"
    max_upload_mb: int = 25


@lru_cache
def get_settings() -> Settings:
    return Settings()
