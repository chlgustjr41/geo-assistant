# GEO Rewrite Assistant

A web application that helps content teams optimize articles for visibility in AI-powered search engines (ChatGPT, Gemini, Perplexity) using the **AutoGEO** framework (Wu et al., ICLR 2026).

Instead of guessing what makes content rank well in generative engine responses, GEO Rewrite Assistant extracts empirical optimization rules from real AI engine behavior, applies them to rewrite articles, and then evaluates the improvement with a simulated RAG pipeline — producing before/after visibility scores.

**Live:** [https://geo-rewrite-assistant.web.app](https://geo-rewrite-assistant.web.app)

## Features

| Feature | Description |
|---------|-------------|
| **Writing Assistant** | Paste or scrape an article, select rule sets, and receive an AI-optimized rewrite with before/after GEO visibility scores |
| **Rules & Corpus** | Build query sets, collect corpus documents, extract GEO rule sets via the AutoGEO 4-stage pipeline, and manage all resources |
| **Settings** | Configure API keys for OpenAI, Gemini, and Anthropic; set default model |
| **Admin** | Super-admin panel for managing the email whitelist (authorized users) |

## Architecture

| Component | Technology | Hosting |
|-----------|-----------|---------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS | Firebase Hosting |
| Backend | Python 3.11+, FastAPI, Uvicorn | GCP e2-micro VM (us-central1) |
| Database | Per-user SQLite via SQLAlchemy | On VM filesystem |
| Auth | Google sign-in via Firebase Authentication | Firebase + Firebase Admin SDK |
| LLM APIs | OpenAI, Google Gemini, Anthropic Claude | Unified via `llm_client.py` |

### Deployment Topology

```
User Browser
  │
  ├── Firebase Hosting (geo-rewrite-assistant.web.app)
  │     └── Static React SPA (Vite build)
  │
  └── GCP VM (34.29.91.25)
        ├── Nginx (HTTPS reverse proxy, SSE support)
        └── Uvicorn (FastAPI backend, port 8000)
              ├── Firebase Admin SDK (token verification)
              ├── Per-user SQLite databases
              └── LLM API calls (OpenAI, Gemini, Claude)
```

## Authentication & Authorization

- **Google sign-in** via Firebase Authentication (popup flow)
- **Email whitelist** stored in `backend/.env` (`ALLOWED_EMAILS` comma-separated)
- Backend verifies Firebase ID tokens on every request via Firebase Admin SDK
- Non-whitelisted accounts see an "Access Denied" screen (not silently rejected)
- **Super-admin** (`chlgustjr41@gmail.com`) is hardcoded in `backend/app/auth.py` — can manage the whitelist via the Admin tab
- Auth can be disabled for local dev by omitting `VITE_FIREBASE_API_KEY` from the frontend `.env`

## Per-User Data Isolation

Each authenticated user gets their own SQLite database at `backend/data/users/<sha256_hash>/geo.db`. This provides complete data isolation — query sets, corpus, rule sets, history, and settings are all per-user. No cross-user data leakage is possible.

## Job Tracking & Recovery

Long-running operations (rule extraction, article rewrite, GEO evaluation) are tracked via:

1. **In-memory job manager** — tracks running jobs with progress, status, and results
2. **Persistent active-job flags** — stored in the user's per-user SQLite `active_jobs` table

This enables recovery across:
- **Browser refresh** — frontend polls `GET /api/jobs/{id}` to resume
- **Sign-out/sign-in** — frontend checks `GET /api/jobs/active/list` which cross-references DB flags with in-memory state
- **Server restart** — stale flags are detected and the user is notified

## Quick Start (Local Development)

### Prerequisites

- Python 3.11+
- Node.js 18+
- API key for at least one provider: OpenAI, Google Gemini, or Anthropic

### 1. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your API keys (see Environment Variables below)
python run.py
# Backend running at http://localhost:8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# Frontend running at http://localhost:5173
```

Open `http://localhost:5173`. When `VITE_FIREBASE_API_KEY` is not set, auth is bypassed and a shared database is used.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | For GPT models | OpenAI API key (`sk-proj-...`) |
| `GOOGLE_API_KEY` | For Gemini models | Google AI Studio key (`AIza...`) |
| `ANTHROPIC_API_KEY` | For Claude models | Anthropic key (`sk-ant-...`) |
| `DEFAULT_MODEL` | No | Default GE model ID (default: `gemini-2.5-flash-lite`) |
| `DEFAULT_RULE_SET` | No | Default rule set ID to pre-select |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | For auth | Path to Firebase Admin SDK service account JSON |
| `ALLOWED_EMAILS` | For auth | Comma-separated whitelist of authorized Google emails |
| `CORS_ORIGINS` | For production | Comma-separated allowed origins (default: `http://localhost:5173`) |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_FIREBASE_API_KEY` | For auth | Firebase web app API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | For auth | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | For auth | Firebase project ID |
| `VITE_API_BASE_URL` | For production | Backend API URL (default: `/` for dev proxy) |

## Workflow Example

### Step 1: Create a Query Set

Navigate to **Rules & Corpus** > **Query Sets**. Choose one of two input modes:

- **Topic mode** — Enter a topic like `"dementia caregiving"` and the system generates 20 search queries that users might ask an AI engine.
- **Article mode** — Paste article text or scrape a URL. The LLM analyzes the content and generates queries relevant to that specific article.

### Step 2: Build a Corpus

Under **Rules & Corpus** > **Corpus**, build a collection of competing documents:

- **Discover from Query Set** — Uses DuckDuckGo to find real web pages matching your queries, then scrape and add them in bulk.
- **Add URL** — Scrape a single page.
- **Add Text** — Paste content directly.

Aim for 10+ documents to avoid falling back to synthetic competitors during evaluation.

### Step 3: Extract a Rule Set

Under **Rules & Corpus** > **Rule Sets**, click **Extract New Rule Set**:

1. Select a query set, a corpus set, and a target GE model.
2. The system runs the AutoGEO 4-stage pipeline (Explainer, Extractor, Merger, Filter) with live SSE progress streaming.
3. After 3-8 minutes, the filtered rule set is saved (typically 15-30 rules).

### Step 4: Optimize an Article

On the **Writing Assistant** tab:

1. Paste your article or scrape a URL.
2. Select one or more rule sets. Multiple sets are LLM-merged before rewriting.
3. Click **Optimize Article** — the article is rewritten following the selected rules.
4. Review the side-by-side diff.

### Step 5: Evaluate GEO Scores

After optimization, run a GEO evaluation:

- **Single Query** — Evaluates against one auto-generated or custom test query.
- **Batch Queries** — Randomly samples N queries from the query set and evaluates each independently.

The evaluation simulates a RAG generative engine: it assembles your article plus competing documents, BM25-ranks them, feeds them to the AI engine, and measures how much of the response cites your article.

## How GEO Evaluation Works

### The Simulation

For each test query, the system:

1. **Assembles a document pool** — Your article alongside competing documents from your corpus (or synthetic competitors if corpus < 10 docs).
2. **BM25-ranks the pool** — All documents ranked using BM25 Okapi.
3. **Simulates a generative engine** — Ranked documents fed to an LLM with a RAG-style prompt, run twice (original + optimized).
4. **Scores both responses** — Measures visibility using AutoGEO metrics.

### Visibility Metrics

All metrics are from AutoGEO (Wu et al., ICLR 2026, Equation 1).

| Metric | What It Measures |
|--------|------------------|
| **Word Visibility** (`V_word`) | Fraction of your article's unique vocabulary that appears in the AI response. Range: 0-100%. |
| **Position Visibility** (`V_pos`) | Like Word Visibility, but weights matches by how early they appear. Always <= V_word. Range: 0-100%. |
| **Overall Visibility** (`V_overall`) | Average of V_word and V_pos. The primary headline metric. |
| **GEU** (Generative Engine Utilization) | Share of explicit [Source N] citations pointing to your article. Range: 0-100%. |

### Limitations

GEO evaluation is a **controlled simulation**, not a measurement of live search engine behavior. Scores are meaningful for comparing before/after optimization quality but should not be interpreted as predictions of actual ranking in ChatGPT, Gemini, or Perplexity. Key differences include corpus size (local vs. billions of pages), model access pathway, prompt construction, retrieval method (BM25 vs. dense vector), and temporal drift.

**Bottom line:** Use GEO scores to measure *relative improvement* from optimization. Treat absolute scores as directional indicators, not guarantees.

## Supported Models

| Model ID | Provider | Tier |
|----------|----------|------|
| `gemini-2.5-flash-lite` | Google | Fast |
| `gemini-2.5-flash` | Google | Standard |
| `gemini-2.5-pro` | Google | Standard |
| `gemini-3-flash-preview` | Google | Fast |
| `gpt-4o-mini` | OpenAI | Fast |
| `gpt-4.1-mini` | OpenAI | Fast |
| `o4-mini` | OpenAI | Fast |
| `gpt-4o` | OpenAI | Standard |
| `gpt-4.1` | OpenAI | Standard |
| `gpt-4.5` | OpenAI | Standard |
| `claude-haiku-4-5-20251001` | Anthropic | Fast |
| `claude-sonnet-4-6` | Anthropic | Standard |
| `claude-opus-4-6` | Anthropic | Standard |

## Security

| Concern | Mitigation |
|---------|-----------|
| Authentication | Google sign-in via Firebase; email whitelist enforced on backend |
| API key exposure | Keys in `backend/.env` only; masked in API responses; `.env` written with `chmod 600` |
| Frontend key access | Frontend never stores or receives raw LLM API keys |
| User isolation | Per-user SQLite databases; no cross-user data access |
| Admin access | Super-admin email hardcoded in source code; cannot be changed without deployment |
| Service account | `service-account.json` is git-ignored; deployed manually to VM |
| Network | Backend behind Nginx HTTPS reverse proxy; CORS restricted to Firebase Hosting domain |

## Production Deployment

See [PRODUCTION.md](PRODUCTION.md) for the full technical specification including deployment instructions, API endpoints, database schema, and pipeline details.

## References

### Papers

- Wu, Zhong, Kim, Xiong. **"AutoGEO: Automated Generative Engine Optimization."** *ICLR 2026.* — Core framework: 4-stage rule extraction pipeline, article rewriting methodology, and GEO visibility metrics.
- Aggarwal et al. **"GEO: Generative Engine Optimization."** *arXiv:2311.09735, 2023.* — Introduced the concept of Generative Engine Optimization and the GEO-Bench evaluation dataset.

### Open-Source Projects

| Project | License | Role |
|---------|---------|------|
| [AutoGEO](https://github.com/cxcscmu/AutoGEO) | MIT | Vendored and adapted — prompt templates, pipeline structure, rewriting methodology |
| [rank-bm25](https://github.com/dorianbrown/rank_bm25) | Apache 2.0 | BM25 Okapi document ranking |
| [sse-starlette](https://github.com/sysid/sse-starlette) | BSD | Server-Sent Events streaming |
| [ddgs](https://github.com/deedy5/duckduckgo_search) | MIT | DuckDuckGo web search for corpus discovery |

## License

This project uses vendored code from [AutoGEO](https://github.com/cxcscmu/AutoGEO) (MIT License). See `backend/autogeo/` for adapted source files and `backend/autogeo/prompts/` for editable prompt templates.
