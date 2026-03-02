from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    PORT: int = 8000
    MONGODB_URI: str = "mongodb://localhost:27017/unbindai"
    JWT_SECRET: str = "dev_secret_change_me"
    GROQ_API_KEY: str = ""
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    FRONTEND_URL: str = "http://localhost:3000"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 7
    COOKIE_NAME: str = "unbind_token"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
