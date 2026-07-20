from functools import lru_cache
from os import environ

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PORT: int = 8000
    MONGODB_URI: str = "mongodb://localhost:27017/unbindai"
    JWT_SECRET: str = "dev_secret_change_me"
    GROQ_API_KEY: str = ""
    HUGGINGFACEHUB_API_TOKEN: str = ""  # Free token from huggingface.co/settings/tokens
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
    # ── Razorpay (payments) ───────────────────────────────────────────────────
    # Test keys (rzp_test_…) hit Razorpay's sandbox; swap for live keys
    # (rzp_live_…) in production. KEY_ID is public (sent to the browser),
    # KEY_SECRET is private (used server-side to create orders and verify
    # payment signatures — must never reach the frontend).
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    FRONTEND_URL: str = "http://localhost:3000"
    # Optional opt-in regex for Vercel preview deployments (e.g.
    # r"https://myproject-.*\.vercel\.app"). Left as None so the broad
    # "*.vercel.app" match is never enabled implicitly.
    VERCEL_PREVIEW_REGEX: str | None = None
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 7
    COOKIE_NAME: str = "unbind_token"

    # ── Email (SMTP) ──────────────────────────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""  # Gmail address used to send emails
    SMTP_PASSWORD: str = ""  # Gmail App Password (not your login password)
    EMAIL_FROM_NAME: str = "UnBind AI"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def _is_local_dev(self) -> bool:
        """Local dev is inferred from FRONTEND_URL pointing at localhost."""
        return self.FRONTEND_URL.startswith("http://localhost") or self.FRONTEND_URL.startswith(
            "http://127.0.0.1"
        )

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        """Fail fast on startup if insecure defaults are used outside local dev.

        Local development (FRONTEND_URL on localhost/127.0.0.1) is allowed to
        boot on the shipped defaults so the app runs out of the box.
        """
        if self._is_local_dev():
            return self

        errors: list[str] = []
        if self.JWT_SECRET == "dev_secret_change_me":
            errors.append(
                "JWT_SECRET is still the insecure default 'dev_secret_change_me'. "
                'Set a strong secret (e.g. `python -c "import secrets; print(secrets.token_hex(32))"`).'
            )
        if not self.GROQ_API_KEY:
            errors.append("GROQ_API_KEY is empty. Set it to a valid Groq API key.")

        if errors:
            raise ValueError(
                "Insecure/missing production settings detected:\n  - " + "\n  - ".join(errors)
            )
        return self


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    environ["LANGCHAIN_TRACING_V2"] = "true" if settings.LANGCHAIN_TRACING_V2 else "false"
    environ["LANGCHAIN_ENDPOINT"] = settings.LANGCHAIN_ENDPOINT
    environ["LANGCHAIN_API_KEY"] = settings.LANGCHAIN_API_KEY
    environ["LANGCHAIN_PROJECT"] = settings.LANGCHAIN_PROJECT
    return settings
