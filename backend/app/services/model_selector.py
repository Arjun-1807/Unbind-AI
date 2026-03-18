from typing import Any

FREE_MODEL = "llama-3.3-70b-versatile"
PRO_MODEL = "llama-3.3-70b-versatile"


def select_model(user: dict[str, Any] | None) -> str:
    if not user:
        return FREE_MODEL
    return PRO_MODEL if user.get("pro", False) else FREE_MODEL
