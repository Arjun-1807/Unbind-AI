from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings
from functools import lru_cache
from os import environ


class Settings(BaseSettings):
    PORT: int = 8000
    MONGODB_URI: str = "mongodb://localhost:27017/unbindai"
    JWT_SECRET: str = "dev_secret_change_me"
    GROQ_API_KEY: str = ""
    LANGCHAIN_TRACING_V2: bool = Field(
        default=False,
        validation_alias=AliasChoices("LANGCHAIN_TRACING_V2", "LANGSMITH_TRACING"),
    )
    LANGCHAIN_ENDPOINT: str = Field(
        default="https://api.smith.langchain.com",
        validation_alias=AliasChoices("LANGCHAIN_ENDPOINT", "LANGSMITH_ENDPOINT"),
    )
    LANGCHAIN_API_KEY: str = Field(
        default="",
        validation_alias=AliasChoices("LANGCHAIN_API_KEY", "LANGSMITH_API_KEY"),
    )
    LANGCHAIN_PROJECT: str = Field(
        default="unbind",
        validation_alias=AliasChoices("LANGCHAIN_PROJECT", "LANGSMITH_PROJECT"),
    )
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    FRONTEND_URL: str = "http://localhost:3000"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 7
    COOKIE_NAME: str = "unbind_token"

    # ── Email (SMTP) ──────────────────────────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""          # Gmail address used to send emails
    SMTP_PASSWORD: str = ""      # Gmail App Password (not your login password)
    EMAIL_FROM_NAME: str = "UnBind AI"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    environ["LANGCHAIN_TRACING_V2"] = "true" if settings.LANGCHAIN_TRACING_V2 else "false"
    environ["LANGCHAIN_ENDPOINT"] = settings.LANGCHAIN_ENDPOINT
    environ["LANGCHAIN_API_KEY"] = settings.LANGCHAIN_API_KEY
    environ["LANGCHAIN_PROJECT"] = settings.LANGCHAIN_PROJECT
    return settings
