"""Negotiation copilot: turn flagged clauses into a ready-to-send message.

Takes the clauses the user wants to renegotiate (plus how they want to come
across) and drafts a plain-language message they can copy and send to the other
party. Runs on a dedicated Groq key via ``negotiation_complete`` so drafting has
its own rate limit, separate from the main analysis pipeline.
"""

import json
import logging
import re

from langsmith import traceable

from app.schemas import NegotiationDraftRequest
from app.services.groq_service import negotiation_complete

logger = logging.getLogger(__name__)

# How each tone should read. Kept human so the model has concrete direction.
_TONE_GUIDANCE = {
    "polite": "warm, respectful and collaborative",
    "neutral": "plain, businesslike and matter-of-fact",
    "firm": "confident and assertive, but still professional and courteous",
}

# Shape/structure guidance per output format.
_FORMAT_GUIDANCE = {
    "email": (
        "an email. Provide a short, specific subject line, and a body with a "
        "greeting and a sign-off."
    ),
    "message": (
        "a short chat / WhatsApp message. Keep it brief and friendly, leave the "
        "subject empty, and use minimal formatting."
    ),
    "letter": (
        "a formal letter. Leave the subject empty, and use a formal salutation and closing."
    ),
}

_SYSTEM_PROMPT = (
    "You are a negotiation-writing assistant for everyday people with no legal "
    "background. You draft a clear, respectful message asking the other party to "
    "change specific contract clauses. Use simple, everyday language — no "
    "legalese. Be concrete about each requested change and give a brief, "
    "reasonable justification. Do NOT invent facts, legal citations, threats, or "
    "deadlines the user did not provide, and do not promise or guarantee any "
    "outcome — keep it a good-faith request to discuss.\n\n"
    "Format your reply as plain text (never JSON, never code fences): the FIRST "
    "line must be exactly `Subject: <a short subject line>` for an email, or "
    "`Subject:` with nothing after the colon for a message or letter. Then one "
    "blank line, then the message itself."
)


def _parse_draft(raw: str) -> dict:
    """Parse the drafted message into ``{subject, body}``.

    Primary format is a leading ``Subject:`` line then a blank line then the
    body. Falls back to tolerating a JSON object (valid, or malformed with
    unescaped newlines) so a disobedient model never leaks braces to the user.
    """
    text = raw.strip()
    # Strip accidental markdown code fences.
    fence = re.match(r"^```(?:\w+)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()

    # Preferred format: "Subject: ...\n<body>".
    match = re.match(
        r"^\s*subject\s*:(?P<subject>.*?)\r?\n(?P<body>.*)$",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if match:
        return {
            "subject": match.group("subject").strip(),
            "body": match.group("body").strip(),
        }

    # Fallback: the model returned JSON despite instructions.
    if text.startswith("{"):
        try:
            data = json.loads(text)
            body = str(data.get("body", "") or "").strip()
            if body:
                return {"subject": str(data.get("subject", "") or "").strip(), "body": body}
        except (json.JSONDecodeError, AttributeError, TypeError):
            # Likely valid-looking JSON but with unescaped newlines in the body;
            # pull the fields out directly so we still show clean prose.
            subj = re.search(r'"subject"\s*:\s*"(.*?)"', text, re.DOTALL)
            body_match = re.search(r'"body"\s*:\s*"(.*)"\s*}?\s*$', text, re.DOTALL)
            if body_match:
                logger.warning("Negotiation draft JSON was malformed; recovered via regex")
                return {
                    "subject": subj.group(1).strip() if subj else "",
                    "body": body_match.group(1).strip(),
                }

    # Last resort: use the whole thing as the body.
    return {"subject": "", "body": text}


@traceable(name="draft_negotiation_message")
async def draft_negotiation_message(req: NegotiationDraftRequest) -> dict:
    """Draft a negotiation message from the selected clause changes.

    Returns ``{"subject": str, "body": str}`` (subject is empty for non-email
    formats). Returns empty strings when there are no usable points.
    """
    points = [p for p in req.points if p.clauseText.strip()]
    if not points:
        return {"subject": "", "body": ""}

    tone = _TONE_GUIDANCE.get(req.tone, _TONE_GUIDANCE["polite"])
    fmt = _FORMAT_GUIDANCE.get(req.format, _FORMAT_GUIDANCE["email"])
    recipient = req.counterparty.strip() or "the other party"
    sender = req.senderName.strip()
    signature = (
        f'Sign off as "{sender}".'
        if sender
        else "Do not invent a name; end with a neutral closing."
    )

    asks = []
    for i, point in enumerate(points, 1):
        block = [f"{i}. Clause: {point.clauseText.strip()}"]
        if point.concern.strip():
            block.append(f"   Concern: {point.concern.strip()}")
        if point.request.strip():
            block.append(f"   Requested change: {point.request.strip()}")
        if point.desiredRewrite and point.desiredRewrite.strip():
            block.append(f"   Preferred wording: {point.desiredRewrite.strip()}")
        asks.append("\n".join(block))

    user_prompt = (
        f"Write {fmt}\n\n"
        f"The message is addressed to: {recipient}.\n"
        f"Tone: {tone}.\n"
        f"{signature}\n\n"
        "Ask for these changes:\n\n"
        f"{chr(10).join(chr(10) + a for a in asks).strip()}\n\n"
        "Keep it concise (under ~300 words). Present the requests as a short "
        "numbered or bulleted list inside the body so they are easy to read, and "
        "invite the recipient to discuss. Remember: first line `Subject: ...`, "
        "then a blank line, then the message."
    )

    raw = await negotiation_complete(
        [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
    )
    return _parse_draft(raw)
