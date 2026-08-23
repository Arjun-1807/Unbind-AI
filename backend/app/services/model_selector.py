"""Which Groq model answers for a given user.

Values come from settings so a model deprecation can be ridden out with an
environment change — see the note on ``CHAT_MODEL_FREE`` in app/config.py.
"""

from typing import Any

from app.config import get_settings
from app.services.plan_service import effective_plan


def free_model() -> str:
    """Model used for signed-out callers and free-tier accounts."""
    return get_settings().CHAT_MODEL_FREE


def select_model(user: dict[str, Any] | None) -> str:
    """Model for ``user``, upgrading paid plans to the pro model.

    Keyed off :func:`effective_plan` rather than the stored ``pro`` boolean.
    That flag is written ``False`` at signup and never updated — buying a plan
    does not touch it, and the auth routes derive the ``pro`` they return from
    ``effective_plan`` precisely because the stored one goes stale. Reading it
    here meant every paying customer was quietly served the free-tier model,
    which went unnoticed only because both tiers pointed at the same model ID.
    """
    settings = get_settings()
    if not user:
        return settings.CHAT_MODEL_FREE
    return settings.CHAT_MODEL_PRO if effective_plan(user) else settings.CHAT_MODEL_FREE
