# UnbindAI — Complete Feature & Security Overview

**What it is:** an AI-powered legal contract analyzer built for people *without* legal training. Upload a PDF or DOCX — or photograph a paper contract with your phone — and get a clause-by-clause risk breakdown in plain English, negotiation help with a ready-to-send message, a glossary of legal jargon, extracted deadlines, and cited what-if impact simulations.

**Who it's for:** non-lawyers facing a contract they're expected to sign — tenants, freelancers, employees, small-business owners. Every AI prompt in the system explicitly targets a ~6th-grade reading level; the product's core claim is comprehension, not legal advice.

**Shape:** a monorepo with three deployables.

| Component | Stack | Purpose |
|---|---|---|
| `backend/` | Python 3.12, FastAPI, MongoDB (Motor) | API, AI pipeline, auth, payments |
| `frontend/` | Next.js 15 App Router, React 19, TypeScript, Tailwind v4 | Web app |
| `cli/` | Node ≥18, ESM | Terminal client (`@sachin-0001/unbind`) |

Hosted on Vercel (two projects), data on MongoDB Atlas, inference on Groq, payments through Razorpay.

---

## 1. Document Intake

Four input paths, all converging on the same analysis pipeline:

| Format | How it's read | Notes |
|---|---|---|
| **PDF** | `pdfplumber`, falling back to `PyPDF2` | Two extractors because real-world PDFs vary wildly |
| **DOCX** | `python-docx` — paragraphs *and* table cells | Tables matter: contract terms often live in them |
| **Plain text** | UTF-8 decode with replacement | |
| **Photos / scans** | Groq vision OCR (`qwen/qwen3.6-27b`) | The differentiating input path |

**Photographing a paper contract** is a first-class flow, not an afterthought:

- Images are downscaled to a 2000 px maximum and re-encoded as JPEG q85 by Pillow before the vision call — smaller payload, faster response, fewer vision tokens.
- HEIC (the iPhone default) is detected and rejected with an actionable message rather than failing opaquely.
- Camera capture appears as a dedicated input on screens ≤640 px wide.
- Size caps are enforced on both sides: 15 MB for images, 25 MB for documents, checked client-side *and* server-side.
- A minimum of 50 extracted characters is required before analysis begins, so an unreadable scan fails fast with guidance instead of producing a confident analysis of nothing.

Extraction runs in a worker thread (`asyncio.to_thread`), so parsing a large PDF never stalls the event loop for other requests.

---

## 2. Contract Analysis — the core

Pipeline (`backend/app/services/analysis_service.py`):

```
raw text
  → markdown conversion (heading detection → structural hierarchy)
  → LLM legal-document classifier  ← gate: rejects non-contracts
  → chunking (2000 chars, 200 overlap)
  → per-chunk clause analysis, fanned out in parallel
  → per-chunk summaries
  → synthesized whole-document report
```

**Per clause, the output is:**

| Field | What it gives the user |
|---|---|
| `clauseText` | The exact original wording |
| `simplifiedExplanation` | What it actually means, in plain English |
| `riskLevel` | High / Medium / Low / Negligible / No Risk |
| `riskReason` | *Why* it's risky — the part users can act on |
| `negotiationSuggestion` | What to ask for instead |
| `suggestedRewrite` | Concrete replacement wording |

**Per document:**

- **Summary** — the whole agreement in a paragraph.
- **Key terms glossary** — every piece of jargon, defined.
- **Key dates** — extracted deadlines, notice periods, renewal windows.
- **Missing clauses** — protections that *should* be there and aren't. This is the analysis most users can't do themselves; you can't notice the absence of a clause you've never heard of.
- **Chunk summaries** — section-by-section navigation for long documents.

**Role-aware:** the user states their side of the deal (tenant vs. landlord, contractor vs. client) and risk is assessed from that position.

### Live progress streaming

Analysis of a long contract takes time, so both analysis endpoints have SSE variants that stream progress rather than leaving the user on a spinner. Stages: `ocr` → `converting` → `validating` → `chunking` → `analyzing_start` → `analyzing_clause` (with `completed`/`total` counts) → `summarizing` → `synthesizing`.

The frontend deliberately bypasses the Next.js rewrite proxy for these calls and hits the backend origin directly — rewrites buffer the full response, which would defeat streaming entirely. `X-Accel-Buffering: no` is set for the same reason.

---

## 3. Impact Simulator (RAG with verifiable citations)

Ask a what-if question — *"what happens if I move out three months early?"* — and get an answer grounded in the actual document.

```
scenario
  → HyDE: generate a hypothetical clause-shaped passage
  → embed (scenario + hypothetical) together
  → vector search over the chunked document (Chroma, k ≤ 6)
  → answer with inline [S1]…[Sn] citation markers
```

**HyDE** (Hypothetical Document Embeddings) exists because a user's question and the contract's language don't look alike. "Can I leave early?" and "Lessee shall provide ninety (90) days written notice of intent to vacate" share almost no vocabulary. Generating a hypothetical *clause* first, then searching with that, retrieves what plain question-embedding misses.

**Citations are verifiable, not decorative.** Each carries `startIndex`/`endIndex` character offsets into the original document, so clicking `[S1]` in the answer scrolls the document pane to the exact source span and highlights it. The user can always check the AI's work — which matters a great deal when the subject is a contract they're about to sign.

**Graceful degradation:** if HyDE fails, the raw scenario is used. If vector search fails entirely, it falls back to keyword matching over the chunks — still with real offsets, so citations keep working.

Embeddings: `sentence-transformers/all-MiniLM-L6-v2` (384-dim) via the HuggingFace Inference API. Notably there is **no local `torch` dependency** — a deliberate choice that keeps the serverless deployment small and cold starts fast.

---

## 4. Negotiation Copilot

Analysis without a next step isn't much use. Two features close that gap:

**Per-clause decisions** — for each flagged clause, choose *keep original* / *use the AI's rewrite* / *write my own*. Decisions accumulate into a revised document.

**Message drafting** — turn those decisions into something sendable, across a tone × format matrix:

| | |
|---|---|
| **Tone** | polite · neutral · firm |
| **Format** | email (with subject line) · WhatsApp message · formal letter |

Addressed to a named counterparty and signed off with the user's name.

The draft parser has a four-tier fallback (`Subject:` regex → JSON → scrape malformed JSON → treat everything as body), so a malformed model response never surfaces as brace soup to the user. The frontend separately filters the model's literal `"No changes needed"` sentinel so it can never get spliced into a document as if it were clause text.

---

## 5. Document Tooling

| Feature | Implementation |
|---|---|
| **Three-pane diff** | Original / review / revised, word-level, with a custom `diffWords` + `buildDocumentSegments` + `applyDecisions` engine. Collapses to tabs on mobile |
| **PDF redline overlay** | Extract text positions with `pdfjs-dist`, stamp rewritten clauses onto the *original* PDF with `pdf-lib` — the layout survives |
| **Calendar export** | Extracted deadlines → `.ics` file or Google Calendar links |
| **PDF report export** | Full analysis as a shareable document via `jsPDF` |
| **Clause highlighting** | Whitespace/punctuation-normalized matching that maps positions back to original offsets, so highlights land correctly even when the model's quoted text differs cosmetically from the source |

---

## 6. Accounts, Plans & Payments

**Authentication:** email/password (bcrypt) or Google Sign-In. JWT HS256 in an httpOnly cookie, with a `localStorage` Bearer fallback for clients that can't use cookies (the CLI).

**Plans** — prices are a server-side catalogue; the browser only ever names a plan:

| Plan | Price | Duration | Analyses/day | AI queries/day | Lawyer directory |
|---|---|---|---|---|---|
| Free | — | — | 1 | 10 | ✗ |
| Brief | ₹100 | 30 days | 3 | 40 | ✗ |
| Motion | ₹450 | 90 days | 5 | 100 | ✗ |
| Verdict | ₹1,500 | Lifetime | Unlimited | Unlimited | ✓ |

Expiry is centralized in one function (`effective_plan`) so a lapsed plan reverts to free-tier treatment consistently — the rate limiter, the plan endpoint, and the directory paywall all route through it rather than each reading `user["plan"]` and drifting apart.

**Razorpay integration:** order creation → Checkout.js → signature verification → plan grant, with a server-to-server webhook as the reliable backstop when the browser never returns.

---

## 7. Lawyer Referral Network

When AI analysis isn't enough, escalate to a human. Lawyers self-register (name, specializations, bio, years of experience, city); the directory is filterable by specialization and gated to the Verdict plan. Contacting a lawyer stores the request and emails them with the user's address as `Reply-To`, so replies go directly to the user without exposing either party's address to the other prematurely.

Records land `verified: false` pending review.

---

## 8. CLI

```bash
unbind contract.pdf     # analyze, then enter an interactive REPL
unbind list             # analysis history
unbind export <file>    # export as md or txt
```

REPL actions: summarize · translate · ask a question · extract clauses · export. Credentials persist to `~/.config/unbindai/config.json`. Requires the Verdict plan.

---

## 9. Security Posture

### Authentication & sessions

- **bcrypt** password hashing via passlib, with per-password salting.
- **JWT HS256**, 7-day expiry, verified on every request; tampered, expired, or wrong-secret tokens are rejected.
- **httpOnly cookies** — JavaScript cannot read the session token.
- `secure` + `SameSite=None` in production, `SameSite=Lax` over plain HTTP locally.
- **`X-Forwarded-Proto` detection** catches a specific real-world misconfiguration: if `FRONTEND_URL` still says `localhost` but the request actually arrived over HTTPS through Vercel's proxy, cookies are still issued with production flags rather than silently insecure ones.
- **Google OAuth verified server-side** — the ID token is checked against Google's `tokeninfo` endpoint and the `aud` claim is matched against the configured client ID. A forged client-side credential doesn't get in.

### Multi-tenancy & data isolation

Every read, write, and delete of user data is scoped to the authenticated user's ID at the query level — not filtered after the fact. Analyses are matched on `{_id, userId}` together, so requesting another user's analysis returns 404 rather than leaking it. Payment history is scoped identically. This is covered by explicit tests that assert user A cannot read *or* delete user B's records.

### Payment integrity

This is the most carefully hardened area of the codebase, and deliberately so:

| Attack | Defense |
|---|---|
| Tampered price | Amounts live in a **server-side catalogue**; the client sends only a plan name |
| Forged callback | **HMAC-SHA256** signature verification using `hmac.compare_digest` (constant-time, so the comparison itself leaks nothing) |
| Lying about payment status | The order is **re-fetched from Razorpay** and asserted `paid` — the client is never trusted |
| Claiming someone else's payment | **Ownership check** against the order's recorded user |
| Replayed `/verify` call | Grants are **idempotent**, keyed on the Razorpay payment ID |
| Two concurrent grants of one payment | A **unique index** on `payments.razorpayPaymentId` is the race-safe backstop |
| Browser never returns | A **webhook** with raw-body signature verification grants the plan anyway |

The grant is ordered so a paying user is never left un-granted: the plan is applied first, the payment recorded second. A crash between the two self-heals on replay. Around 30 tests cover these paths specifically, including replay, signature mismatch, amount mismatch, and wrong-user scenarios.

### Secrets management

- No secret has ever been committed — **Gitleaks scans the full history** on every push and PR, and blocks the build on a finding.
- `.env` files are gitignored; `.env.example` documents variable *names* only.
- **Fail-fast production validator:** the app refuses to boot outside local dev if `JWT_SECRET` is still the shipped default or `GROQ_API_KEY` is empty. A misconfigured deploy dies loudly at startup instead of running insecurely.
- `RAZORPAY_KEY_SECRET` is server-only and never reaches the browser; only the public `KEY_ID` is exposed.

### Input validation & abuse resistance

- **Upload size caps** — 15 MB images, 25 MB documents, enforced server-side. A large file can't be read into memory unbounded.
- **Length limits on every LLM-bound field** — document text, scenarios, clause text, and the number of negotiation points are all capped. Without these, one request could drive an arbitrary number of model calls.
- **Pydantic validation on every request body**, with `EmailStr` on all address fields.
- **HTML-escaped email templates** — user-supplied content (contact messages, addresses) is escaped before interpolation, so nobody can inject markup or links into mail that arrives looking like it came from UnBind AI.
- **Malformed IDs answer 400, not 500** — a bad path parameter is a client error and is reported as one.

### Rate limiting & cost control

Two independent layers:

**Inbound, per user** — daily quotas enforced atomically. The check-and-increment is a single conditional database update, so two simultaneous requests can't both observe "0 used" and both pass; the loser gets a 429. Two separate counters (full analyses vs. cheaper follow-up AI queries) so heavy questioning doesn't consume a user's analysis allowance. Every LLM-backed endpoint is metered — including the impact simulator and negotiation drafting, which are the most expensive per call.

**Failure-safe:** the quota is *reserved* before the work and *refunded* if it fails. A free user (1 analysis/day) whose scan OCRs badly or whose upload is rejected as non-legal doesn't lose their day to an error they didn't cause. Refunds are best-effort and never escalate a handled error into a 500, and a refund arriving after midnight is dropped rather than corrupting the next day's counter.

**Outbound, to Groq** — four feature-scoped API keys (analysis, HyDE, negotiation, vision OCR), each with its own concurrency semaphore. Features draw on independent per-key rate limits instead of competing, so a burst of OCR work can't starve contract analysis. Rate-limit responses are retried with backoff that honors the upstream `Retry-After` header.

### Network & transport

- **Allowlist CORS** — the configured frontend plus localhost. The broad `*.vercel.app` match is *opt-in* via an explicit regex, so anonymous Vercel deployments can't call the API by default.
- `allow_credentials` is paired with a specific origin list, never a wildcard.

### AI-specific safeguards

- **Legal-document classifier gate** — an LLM check rejects non-contracts up front, so users don't get confident risk analysis of a restaurant menu.
- **Verifiable citations** — every simulator claim carries character offsets back to the source text. The user can check the AI rather than trust it. The prompt explicitly forbids inventing citation labels or citing contract clause numbers as if they were sources.
- **Layered JSON recovery** — code-fence stripping → `json.loads` → a balanced-brace span scanner (string- and escape-aware) → structured failure. A chatty model response degrades to a clear error, never to garbage rendered as analysis.
- **Distinguished failure modes** — "the model returned an unexpected format" and "no clauses found in this document" are different errors with different user guidance.

### Supply chain & static analysis

- **Semgrep SAST** across `p/default`, `p/python`, `p/typescript`, `p/react`, `p/secrets` on every push and PR.
- **Gitleaks** secret scanning over full history — blocking.
- CI enforces `ruff check`, `ruff format --check`, `pytest`, `eslint`, `tsc --noEmit`, `vitest`, and a production `next build`. A PR that breaks any of these can't merge green.

---

## 10. Reliability & Operations

- **Readiness health check** — `/api/health` pings MongoDB and answers 503 when it can't. It reports what's actually true rather than always claiming healthy.
- **Startup index creation** — idempotent and independently attempted per index, so one failure (a pre-existing duplicate blocking a unique build) doesn't silently skip the rest. Failures log explicitly that the guarantee is *not* in effect.
- **Indexes backing correctness, not just speed:** unique `users.email` closes the check-then-insert race in signup where two concurrent requests could both create an account for one address; unique `payments.razorpayPaymentId` is the payment idempotency backstop; unique `lawyers.email` does the same for registration.
- **Pagination** on every list endpoint, with the largest field (`documentText`) projected out of list responses — it's never rendered in a list, and it dominates the payload. The full record is fetched only when a document is actually opened.
- **Non-blocking I/O throughout** — PDF/DOCX parsing, Pillow preprocessing, and SMTP sends all run in worker threads.
- **LangSmith tracing** on every LLM entry point, with per-request metadata (endpoint, user, file name, text length) and tags.
- **Structured logging** with a configured root level, so informational logs actually reach the log stream.
- **Streaming errors are always delivered as events**, never as a truncated connection — the client can render a real message instead of showing a dead spinner.

### Test coverage

**121 automated tests.**

- 103 backend (pytest, async, in-memory fakes — no network, no real database): JWT lifecycle and tamper resistance, cookie-vs-Bearer precedence, bcrypt behavior, the full payment flow including replay/signature/amount/user-mismatch, quota enforcement and refunding across plans and day boundaries, cross-tenant isolation, the paywall gate including expiry, upload size guards, OCR detection and preprocessing, negotiation parser fallbacks.
- 18 frontend (vitest): the diff engine, storage helpers, currency formatting.

---

## 11. Design & Accessibility

`frontend/DESIGN.md` is a full design-system specification: a Linear-inspired near-black palette (`canvas #010102`, accent `#5e6ad2`), a typography and spacing scale, elevation rules, component conventions, and a responsive strategy.

Light and dark themes are CSS-variable-driven with SSR-safe persistence. Layouts are mobile-first: the diff view collapses to tabs, camera capture appears only on small screens. Error boundaries exist per-route with an animated scales-of-justice loader.

---

## 12. Honest Limitations

Stated plainly, because a security document that only lists strengths isn't useful:

- **Not legal advice.** The product explains a contract; it doesn't replace a lawyer. The referral network exists precisely because that boundary is real.
- **Prompt injection is not yet mitigated.** Document text is concatenated into prompts without delimiting or instruction-hierarchy defense. A contract containing adversarial instructions could in principle steer its own analysis.
- **The `verified` flag on lawyers has no admin workflow** to set it, and registration is an unauthenticated public endpoint without a captcha or rate limit.
- **The vector index is rebuilt per request** — every simulator question re-embeds the whole document. Correct, but wasteful; persisting embeddings per analysis is the next planned change.
- **Paid tiers currently use the same model as free** (`FREE_MODEL == PRO_MODEL`). Quotas and features differ; model quality does not yet.
- **Semgrep runs in audit mode** — findings are reported but don't block the build, pending triage of the existing set.
- **No error tracking** (Sentry or equivalent) and **no token/cost accounting** per user yet.
- **No session revocation** — logout is client-side, and a token remains valid until it expires.

---

*Generated 2026-07-26. Reflects the codebase at commit `42b56ae` plus the current working tree.*
