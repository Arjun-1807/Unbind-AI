## UnbindAI: AI-Powered Legal Contract Analyzer

UnbindAI uses AI to break down legal contracts into plain English. Upload a PDF, or snap a photo of a paper contract, and get instant clause-by-clause risk analysis, negotiation suggestions (including a ready-to-send negotiation message), a key terms glossary, deadline tracking, and cited what-if impact simulations.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Node.js CLI](https://img.shields.io/badge/CLI-339933?style=for-the-badge&logo=node.js&logoColor=white)

---

## Features

| Feature                   | Description                                                 |
| ------------------------- | ----------------------------------------------------------- |
| **📄 PDF / DOCX Upload**  | Drag-and-drop or click to upload any legal contract         |
| **📸 Photo / Scan OCR**   | Photograph or upload an image of a paper contract; a Groq vision model reads the text |
| **⚠️ Risk Analysis**      | Clause-by-clause risk scoring with a visual risk meter      |
| **🤝 Negotiation Helper** | AI-generated clause rewrites (keep/AI/custom) **plus a ready-to-send negotiation message** you can copy and send |
| **📖 Key Terms Glossary** | Legal jargon explained in plain English                     |
| **📅 Key Dates**          | Automatic deadline extraction with ICS calendar export      |
| **🎯 Impact Simulator**   | "What if I…?" scenario testing; answers cite the exact clauses and jump to them in the document |
| **📄 Document View**      | Side-by-side view with interactive clause highlighting      |
| **📥 PDF Export**         | Download full analysis reports and modified contracts       |
| **🔐 Auth**               | Secure JWT-based signup/login                               |
| **📁 Dashboard**          | View and manage all past analyses                           |
| **💻 CLI REPL**           | `npm install -g unbindai`: analyse contracts from terminal  |

---

## Architecture

```
UnbindAI/
├── backend/                    # Python FastAPI
│   ├── app/
│   │   ├── main.py             # App entry + lifespan
│   │   ├── config.py           # Pydantic Settings
│   │   ├── database.py         # Motor (async MongoDB)
│   │   ├── schemas.py          # Request/response models
│   │   ├── auth.py             # JWT + bcrypt
│   │   ├── routes/
│   │   │   ├── auth_routes.py
│   │   │   └── analysis_routes.py
│   │   └── services/
│   │       ├── groq_service.py       # Groq LLM client (chat, HyDE, negotiation, vision OCR)
│   │       ├── pdf_processing.py     # Text extraction + chunking
│   │       ├── analysis_service.py   # Contract analysis + HyDE-cited impact simulator
│   │       ├── negotiation_service.py # Drafts ready-to-send negotiation messages
│   │       └── ocr_service.py        # Vision OCR for photographed/scanned contracts
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                   # Next.js 15 (App Router)
│   ├── src/
│   │   ├── app/                # File-based routing
│   │   ├── components/         # 18 React components
│   │   ├── context/            # Auth context provider
│   │   ├── services/api.ts     # Backend API client
│   │   ├── types.ts
│   │   └── constants.ts
│   ├── package.json
│   └── next.config.mjs
│
└── cli/                        # npm package: unbindai
    ├── bin/unbind.js            # Shebang entry point
    ├── src/
    │   ├── index.js             # main(), arg parsing
    │   ├── repl.js              # Interactive REPL loop
    │   ├── api.js               # HTTP client (fetch)
    │   ├── auth.js              # Token management
    │   ├── config.js            # Persistent config store
    │   └── display.js           # chalk/boxen formatters
    └── package.json

```

## How It Works

```
User uploads a PDF/DOCX, or photographs a paper contract
       ↓
Text extracted (pdfplumber / PyPDF2), OR images read by a Groq vision model (OCR)
       ↓
Text is semantically chunked (heading-aware splitting)
       ↓
Each chunk → Groq LLM (Llama 3.3 70B) for analysis
       ↓
Results synthesized into unified report
       ↓
Stored in MongoDB + returned to frontend
       ↓
Interactive UI with tabs, highlighting, and export
```

The **Impact Simulator** adds a retrieval step: it uses HyDE (hypothetical-document embeddings) over a Chroma index of the contract to find the most relevant clauses, then answers with **inline citations** that link back to the exact text. Retrieval, message drafting, and OCR each run on their own optional Groq key so they don't share rate limits (see [API Keys](#api-keys)).

---

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- [MongoDB Atlas](https://cloud.mongodb.com/) account (free M0 tier)
- [Groq API](https://console.groq.com/) key (free)

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/UnbindAI.git
cd UnbindAI
```

### 2. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt

# Create .env from template
cp .env.example .env
# Edit .env with your actual credentials

uvicorn app.main:app --reload --port 8000
```

→ API at **http://localhost:8000** | Docs at **http://localhost:8000/docs**

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

→ App at **http://localhost:3000**

### 4. CLI (optional)

```bash
cd cli
npm install -g .

# Then from anywhere:
unbind contract.pdf
```

→ Interactive terminal REPL, no browser needed

---

## API Keys

| Variable       | Source                                                                                | Cost           |
| -------------- | ------------------------------------------------------------------------------------- | -------------- |
| `MONGODB_URI`  | [MongoDB Atlas](https://cloud.mongodb.com/) → Create free cluster → Connect → Drivers | Free (512MB)   |
| `GROQ_API_KEY` | [Groq Console](https://console.groq.com/) → API Keys → Create                         | Free           |
| `JWT_SECRET`   | `python -c "import secrets; print(secrets.token_hex(32))"`                            | Self-generated |
| `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com/) → Create → OAuth 2.0 Client ID | Free           |
| `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/) → Create → OAuth 2.0 Client ID | Free           |
| `HUGGINGFACEHUB_API_TOKEN` | [HuggingFace](https://huggingface.co/settings/tokens) → New token (read scope), used for embeddings | Free |
| `SMTP_USER` / `SMTP_PASSWORD` | Gmail address + [App Password](https://support.google.com/accounts/answer/185833), required for lawyer-contact emails | Free |

> **Feature-specific Groq keys** (all optional; each falls back to `GROQ_API_KEY`, so a single key still works): `HYDE_KEY` (impact-simulator retrieval), `NEGOTIATION_KEY` (negotiation-message drafting), and `GROQ_VISION` (photo/scan OCR). Giving each feature its own key means they draw on independent per-key rate limits. OCR also needs `OCR_MODEL` set to a **vision-capable** Groq model (default `qwen/qwen3.6-27b`; verify against Groq's current model list, as vision IDs change).
>
> **Other optional settings** (sane defaults, override only if needed): `PORT`, `FRONTEND_URL`, `LANGSMITH_*` (tracing), `SMTP_HOST` / `SMTP_PORT` / `EMAIL_FROM_NAME`, `JWT_ALGORITHM` / `JWT_EXPIRE_DAYS` / `COOKIE_NAME`, and `VERCEL_PREVIEW_REGEX` (opt-in CORS for Vercel preview URLs). See [`backend/.env.example`](backend/.env.example) for the full list.

---

## CLI: `unbind`

A standalone terminal REPL that talks to the same backend. Useful for quick analysis without opening a browser.

### Install

```bash
# From this repo
cd cli && npm install -g .

# From npm (once published)
npm install -g unbindai
```

### Usage

```bash
unbind contract.pdf
unbind --server https://api.example.com nda.pdf
unbind --logout
```

### Session

```
╭──────────────────────────────────────────╮
│   UnBindAI CLI                           │
│   AI-powered legal contract analysis     │
╰──────────────────────────────────────────╯

⠙ Uploading and analysing contract.pdf…
✓ Analysis complete  (contract.pdf)

  ✓ Loaded: contract.pdf
    42 clauses  ·  3 high-risk

? What would you like to do?
❯ 1. Summarize
  2. Translate to plain English
  3. Ask a question
  4. Extract clauses
  ─────────────────────
  5. Exit
```

### REPL Options

| # | Action | Backend call |
|---|--------|--------------|
| 1 | **Summarize** | `analysisResult.summary` (from upload response) |
| 2 | **Translate to plain English** | `clauses[].simplifiedExplanation` |
| 3 | **Ask a question** | `POST /api/analysis/simulate` |
| 4 | **Extract clauses** | Full clause list with risk + negotiation tips |
| 5 | **Exit** | None |

### CLI Flags

| Flag | Description |
|------|-------------|
| `--server <url>` | Backend URL (default: `http://localhost:8000`) |
| `--logout` | Clear stored credentials |
| `-h, --help` | Show help |
| `UNBINDAI_API_URL` env | Override server URL without a flag |

### Risk Levels

| Badge | Meaning |
|-------|---------|
| 🔴 **High** | Significant risk: likely needs legal review |
| 🟡 **Medium** | Moderate concern: consider negotiating |
| 🟢 **Low** | Minor risk: worth noting |
| ⚪ **Negligible** | Standard clause with minimal risk |
| 🔵 **No Risk** | Neutral / boilerplate: no action needed |

Credentials are stored in `~/.config/unbindai/config.json` (Linux) and reused across sessions.

---

## API Endpoints

### Auth

| Method | Endpoint           | Description             |
| ------ | ------------------ | ----------------------- |
| POST   | `/api/auth/signup` | Create account          |
| POST   | `/api/auth/login`  | Login (sets JWT cookie) |
| POST   | `/api/auth/logout` | Clear auth cookie       |
| GET    | `/api/auth/me`     | Current user info       |

### Analysis

| Method | Endpoint                             | Description                                          |
| ------ | ------------------------------------ | ---------------------------------------------------- |
| POST   | `/api/analysis/upload`               | Upload PDF/DOCX/image → full analysis (images OCR'd) |
| POST   | `/api/analysis/upload/stream`        | Same, streaming progress via SSE (OCR step included) |
| POST   | `/api/analysis/analyze`              | Analyze raw text                                     |
| GET    | `/api/analysis/history`              | User's past analyses                                 |
| GET    | `/api/analysis/history/:id`          | Single analysis by ID                                |
| DELETE | `/api/analysis/history/:id`          | Delete an analysis                                   |
| POST   | `/api/analysis/simulate`             | What-if impact simulation (returns cited answer)     |
| POST   | `/api/analysis/negotiation-message`  | Draft a ready-to-send negotiation message            |

---

## Tech Stack

| Layer    | Tech                                                            |
| -------- | --------------------------------------------------------------- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS v4               |
| Backend  | FastAPI, Python 3.12, Pydantic                                  |
| Database | MongoDB Atlas (Motor async driver)                              |
| AI       | Groq API: Llama 3.3 70B (analysis/HyDE/negotiation) · Qwen3 vision (OCR) |
| Retrieval| Chroma vector store · HuggingFace embeddings · HyDE query expansion |
| Auth     | JWT (python-jose), bcrypt (passlib)                             |
| PDF/Image| pdfplumber, PyPDF2, Pillow (backend) · jsPDF, pdf-lib (frontend export) |
| CLI      | Node.js 18+, inquirer, chalk, ora, boxen, conf                  |

---
