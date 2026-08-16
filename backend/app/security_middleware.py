"""Cross-cutting HTTP security middleware: Origin/CSRF validation and rate limiting.

Both concerns are implemented as ASGI middleware rather than per-route
dependencies or decorators so that they cover every route — including routes
added later — without each route module having to opt in.

Registration order is handled by :func:`add_security_middleware`; see its
docstring for the resulting request pipeline.
"""

import logging
import math
import os
import re
import time
from collections import deque
from collections.abc import Iterable
from typing import NamedTuple
from urllib.parse import urlsplit

from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# Methods that can commit a side effect, and therefore the ones a CSRF attack
# cares about. GET/HEAD/OPTIONS are read-only (or preflight) and pass through.
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Hard ceiling on any request body, enforced at the ASGI layer.
#
# This is NOT redundant with the per-upload limits in analysis_routes: those run
# inside the route, and by the time a route (or even a dependency) executes,
# FastAPI has already called `await request.form()`, which makes Starlette spool
# every file part into a SpooledTemporaryFile with no *total* cap. So a multi-GB
# upload lands on disk before any handler-level check can object. Rejecting here,
# before the body is ever read, is the only place that bounds disk.
#
# Set above the largest legitimate upload (25MB documents / 15MB images) with
# headroom for multipart framing.
MAX_REQUEST_BYTES = 30 * 1024 * 1024


class BodySizeLimitMiddleware:
    """Reject over-large request bodies before anything spools them to disk.

    Implemented as raw ASGI rather than ``BaseHTTPMiddleware`` because it has to
    intercept the ``receive`` channel itself; BaseHTTPMiddleware would already
    have buffered the body.
    """

    def __init__(self, app, max_bytes: int = MAX_REQUEST_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        # Fast path: a truthful Content-Length lets us refuse without reading.
        for name, value in scope.get("headers") or ():
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    break
                if declared > self.max_bytes:
                    logger.warning(
                        "Rejected request to %s: Content-Length %d exceeds %d",
                        scope.get("path", "?"),
                        declared,
                        self.max_bytes,
                    )
                    return await self._reject(send)
                break

        # Slow path: a chunked body has no Content-Length, so count as it streams
        # and cut the stream off the moment it goes over. Downstream sees a
        # disconnect and abandons its partial spool, which is what bounds disk.
        received = 0

        async def counting_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    logger.warning(
                        "Aborted streamed request to %s: body exceeded %d bytes",
                        scope.get("path", "?"),
                        self.max_bytes,
                    )
                    return {"type": "http.disconnect"}
            return message

        return await self.app(scope, counting_receive, send)

    async def _reject(self, send) -> None:
        body = b'{"detail":"REQUEST_TOO_LARGE"}'
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


# ── Rate limit configuration ─────────────────────────────────────────────────


class RateLimitRule(NamedTuple):
    """One throttling rule.

    ``methods=None`` throttles every method; otherwise only the listed ones are
    counted and the rest are unlimited.
    """

    prefix: str
    limit: int
    window: int
    methods: frozenset[str] | None = None


# Checked in order and the FIRST match wins, so more specific prefixes must be
# listed before any broader prefix that would also match them. Anything not
# matched here is unlimited.
#
# The limits target the abuse cases that cost real money or real accounts:
# credential guessing on login, bulk free-account creation (each account carries
# an LLM quota, so signup spam drains the Groq budget), and bulk analysis.
RATE_LIMITS: tuple[RateLimitRule, ...] = (
    # 10 / minute — password guessing.
    RateLimitRule("/api/auth/login", 10, 60),
    # 5 / hour — free-account farming, which drains the owner's Groq budget.
    RateLimitRule("/api/auth/signup", 5, 3600),
    # 5 / hour — the SAME free-account farming as /signup. POST /api/auth/google
    # inserts a brand-new user document on first sign-in (auth_routes.py), so it
    # is a second, equally cheap account factory; leaving it unlisted made the
    # signup rule above trivially bypassable by taking the Google path instead.
    RateLimitRule("/api/auth/google", 5, 3600),
    # 10 / hour — current-password guessing against a hijacked session.
    RateLimitRule("/api/auth/update-password", 10, 3600),
    # 3 / hour — unauthenticated write.
    RateLimitRule("/api/lawyer-register", 3, 3600),
    # 10 / hour — Razorpay order spam.
    RateLimitRule("/api/user/plan/create-order", 10, 3600),
    # 30 / hour — LLM spend. Scoped to POST on purpose: every endpoint under
    # this prefix that costs a Groq call (analyze, upload, chat, simulate,
    # negotiation-message) is a POST, whereas GET /analysis/history and
    # GET /analysis/{id}/chat are ordinary page reads. Throttling those at
    # 30/hour would 429 a paying user who merely browses their own dashboard.
    RateLimitRule("/api/analysis", 30, 3600, methods=frozenset({"POST"})),
)

# Razorpay's server-to-server webhook. Legitimately bursty (retries, batched
# events) and separately authenticated by HMAC signature verification, so
# throttling it would only cause us to drop payment notifications.
RATE_LIMIT_EXEMPT_PATHS = frozenset({"/api/user/plan/webhook"})


def _path_matches(path: str, prefix: str) -> bool:
    """Segment-aware prefix match.

    ``startswith`` alone would make the ``/api/analysis`` rule also cover an
    unrelated ``/api/analysis-export`` route, so require either an exact match
    or a ``/`` boundary.
    """
    return path == prefix or path.startswith(prefix + "/")


def _read_trusted_proxy_hops() -> int:
    """Number of proxies that append to ``X-Forwarded-For`` in front of us.

    Read straight from the environment rather than added to ``Settings``: this
    is the only consumer, and ``client_ip`` is called on the hot path of every
    throttled request, so it must not depend on the settings object being
    importable/constructed (config.py raises on a missing JWT_SECRET).

    ``0`` means "no proxy" — trust only the socket peer and ignore the header
    entirely, which is the correct setting for a directly exposed deployment.
    """
    raw = os.getenv("TRUSTED_PROXY_HOPS", "1")
    try:
        hops = int(raw)
    except ValueError:
        logger.warning("Invalid TRUSTED_PROXY_HOPS=%r; falling back to 1", raw)
        return 1
    return max(hops, 0)


# Resolved once at import, like the rest of the module's configuration. Tests
# override the module attribute directly.
TRUSTED_PROXY_HOPS = _read_trusted_proxy_hops()


def client_ip(request: Request) -> str:
    """Best-effort client IP, read from the RIGHT of ``X-Forwarded-For``.

    Deployed behind Vercel / a reverse proxy, so the socket peer is the proxy
    and the real client has to come from the header. But proxies *append*: each
    hop adds the address it saw to the end of whatever the request already
    carried. So on a request the attacker crafted with
    ``X-Forwarded-For: <anything>``, that forged value ends up FIRST and the
    only trustworthy entries are the rightmost ones, written by our own
    infrastructure. Taking ``parts[0]`` therefore let an attacker mint a fresh
    rate-limit bucket per request by rotating the header, nullifying every rule
    in ``RATE_LIMITS``.

    Instead index back from the end by ``TRUSTED_PROXY_HOPS`` (default 1): with
    one proxy the last entry is the peer address that proxy actually observed,
    which the client cannot influence. Deployments with N chained proxies must
    set the env var to N or they will key on the last proxy's own address.

    Anything the header cannot answer — absent, all-empty, or fewer entries
    than there are trusted hops (a request that never traversed the full proxy
    chain) — falls back to the socket peer rather than to an attacker-supplied
    value.
    """
    peer = request.client.host if request.client else "unknown"

    hops = TRUSTED_PROXY_HOPS
    if hops <= 0:
        return peer

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        parts = [part.strip() for part in forwarded.split(",")]
        parts = [part for part in parts if part]
        if len(parts) >= hops:
            return parts[-hops]
    return peer


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Fixed-set-of-prefixes sliding-window rate limiter keyed on client IP.

    LIMITATION — this store lives in process memory. That means limits are
    enforced *per instance*: with N serverless instances or workers the
    effective ceiling is N x the configured limit, and every cold start resets
    all counters. It still raises the cost of the attacks above by orders of
    magnitude, but the production follow-up is a shared backend (Redis, or a
    TTL-indexed Mongo collection reusing the existing Motor client) so the
    window is global. Deliberately no Redis dependency is added here.

    Not lock-protected: ``dispatch`` runs on the asyncio event loop and never
    awaits between reading and mutating a bucket, so there is no interleaving
    within a process.
    """

    def __init__(
        self,
        app,
        rules: Iterable[RateLimitRule] = RATE_LIMITS,
        exempt_paths: Iterable[str] = RATE_LIMIT_EXEMPT_PATHS,
        prune_interval: float = 300.0,
        max_tracked_keys: int = 50_000,
    ) -> None:
        super().__init__(app)
        self._rules = tuple(RateLimitRule(*rule) for rule in rules)
        self._exempt_paths = frozenset(exempt_paths)
        self._prune_interval = prune_interval
        self._max_tracked_keys = max_tracked_keys
        # (rule prefix, client ip) -> monotonic timestamps of recent hits.
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._window_for: dict[str, int] = {rule.prefix: rule.window for rule in self._rules}
        self._last_prune = time.monotonic()

    def _rule_for(self, path: str, method: str) -> RateLimitRule | None:
        for rule in self._rules:
            if _path_matches(path, rule.prefix) and (
                rule.methods is None or method in rule.methods
            ):
                return rule
        return None

    def _prune(self, now: float) -> None:
        """Drop expired timestamps and empty buckets so the store stays bounded."""
        self._last_prune = now
        for key, hits in list(self._hits.items()):
            window = self._window_for.get(key[0], 0)
            cutoff = now - window
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if not hits:
                del self._hits[key]

        # Hard ceiling as a memory safety valve: if a spray of distinct IPs
        # still leaves us over the cap, evict the least recently active keys.
        overflow = len(self._hits) - self._max_tracked_keys
        if overflow > 0:
            logger.warning(
                "Rate limit store over capacity (%d keys); evicting %d least recent",
                len(self._hits),
                overflow,
            )
            stale = sorted(self._hits, key=lambda k: self._hits[k][-1])[:overflow]
            for key in stale:
                del self._hits[key]

    async def dispatch(self, request: Request, call_next) -> Response:
        # CORS preflights must never be throttled or they'd break the real
        # request that follows; they also commit no side effect themselves.
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if path in self._exempt_paths:
            return await call_next(request)

        rule = self._rule_for(path, request.method)
        if rule is None:
            return await call_next(request)

        now = time.monotonic()
        if now - self._last_prune >= self._prune_interval:
            self._prune(now)

        key = (rule.prefix, client_ip(request))
        hits = self._hits.setdefault(key, deque())
        cutoff = now - rule.window
        while hits and hits[0] <= cutoff:
            hits.popleft()

        if len(hits) >= rule.limit:
            retry_after = max(1, math.ceil(hits[0] + rule.window - now))
            logger.warning(
                "Rate limit exceeded: %s %s from %s (%d/%ds)",
                request.method,
                path,
                key[1],
                rule.limit,
                rule.window,
            )
            return JSONResponse(
                {"detail": "Too many requests. Please try again later."},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )

        hits.append(now)
        return await call_next(request)


class OriginValidationMiddleware(BaseHTTPMiddleware):
    """CSRF defence by Origin validation.

    The auth cookie is ``SameSite=None`` in production so the browser attaches
    it to cross-site requests. CORS does not help: it gates *reading* the
    response, while CORS-safelisted requests (``multipart/form-data``, empty or
    ``text/plain`` bodies) are dispatched cross-site with no preflight at all
    and the side effect commits regardless of whether the attacker can read the
    reply. So an auto-submitting form on any site could hit e.g.
    ``POST /api/user/plan/cancel`` (no body) or ``POST /api/analysis/upload``
    (multipart) with the victim's cookie.

    Origin validation is used rather than a double-submit CSRF token because it
    needs no coordinated frontend change: browsers set ``Origin`` on every
    cross-site state-changing request, so checking it closes the hole today.

    The rules, in order:

    1. Safe methods (GET/HEAD/OPTIONS) pass through untouched, keeping CORS
       preflight working.
    2. ``Origin`` present and not allowed -> 403.
    3. No ``Origin`` but a parseable ``Referer`` -> compare its scheme+host.
    4. NEITHER header present -> ALLOW. Non-browser clients send no Origin:
       the project's Node CLI in ``cli/``, and Razorpay's server-to-server
       webhook at ``/api/user/plan/webhook`` (which is HMAC-verified on its
       own). Browsers always send Origin on cross-site state changes, so
       allowing the header-less case does not reopen the attack.
    """

    def __init__(self, app, allowed_origins: Iterable[str], allow_origin_regex: str | None = None):
        super().__init__(app)
        # Match Starlette's CORSMiddleware normalisation so the two can't
        # disagree over a trailing slash.
        self._allowed = {origin.rstrip("/") for origin in allowed_origins if origin}
        self._origin_regex = re.compile(allow_origin_regex) if allow_origin_regex else None

    def _is_allowed(self, origin: str) -> bool:
        if origin in self._allowed:
            return True
        return bool(self._origin_regex and self._origin_regex.fullmatch(origin))

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method not in UNSAFE_METHODS:
            return await call_next(request)

        source = "Origin"
        origin = request.headers.get("origin")
        if not origin:
            referer = request.headers.get("referer")
            if referer:
                parts = urlsplit(referer)
                if parts.scheme and parts.netloc:
                    origin = f"{parts.scheme}://{parts.netloc}"
                    source = "Referer"

        # Rule 4: no browser context to verify — non-browser client.
        if not origin:
            return await call_next(request)

        if self._is_allowed(origin.rstrip("/")):
            return await call_next(request)

        logger.warning(
            "Blocked cross-site request: %s %s with %s=%r",
            request.method,
            request.url.path,
            source,
            origin,
        )
        return JSONResponse({"detail": "Cross-site request blocked."}, status_code=403)


def add_security_middleware(
    app: FastAPI,
    allowed_origins: Iterable[str],
    allow_origin_regex: str | None = None,
) -> None:
    """Register the rate limiter and the Origin check on ``app``.

    Starlette's ``add_middleware`` inserts at the front of the stack, so the
    LAST middleware registered is the OUTERMOST one and runs first. Registering
    Origin validation before the rate limiter therefore yields:

        CORS (registered after this call, outermost)
          -> rate limit
            -> Origin/CSRF check
              -> routes

    Cheap throttling runs ahead of the CSRF check, and CORS stays outermost so
    that (a) OPTIONS preflights are answered by CORSMiddleware and never reach
    the checks below, and (b) 429/403 bodies still carry CORS headers for
    legitimate origins, which is what lets the real frontend surface the error.

    ``allowed_origins`` is the very list ``main.py`` hands to CORSMiddleware, so
    the CORS allowlist and the CSRF allowlist cannot drift apart.
    """
    app.add_middleware(
        OriginValidationMiddleware,
        allowed_origins=allowed_origins,
        allow_origin_regex=allow_origin_regex,
    )
    app.add_middleware(RateLimitMiddleware)
    # Registered last, so it is the outermost of the three and refuses an
    # oversized body before the limiter or the CSRF check does any work — and,
    # critically, before FastAPI's form parsing spools it to disk.
    app.add_middleware(BodySizeLimitMiddleware)
