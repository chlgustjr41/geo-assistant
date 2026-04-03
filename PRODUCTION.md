# GEO Rewrite Assistant — Technical Specification

Full technical reference for the GEO Rewrite Assistant system. For setup instructions and workflow overview, see [README.md](README.md).

---

## 1. Architecture Overview

```
geo-assistant/
├── backend/                        # Python 3.11+ / FastAPI
│   ├── app/
│   │   ├── main.py                 # App entrypoint, CORS, router mounts
│   │   ├── auth.py                 # Firebase token verification, email whitelist, super-admin
│   │   ├── config.py               # .env reader/writer, key validation, whitelist helpers
│   │   ├── database.py             # Per-user SQLite engine management + schema migrations
│   │   ├── deps.py                 # Shared FastAPI dependencies (auth + user-scoped DB)
│   │   ├── models.py               # ORM models (RuleSet, Article, QuerySet, CorpusSet, CorpusDocument, ActiveJob)
│   │   ├── seed.py                 # Built-in rule set seeding (per-user DB)
│   │   ├── job_manager.py          # In-memory job tracker for long-running tasks
│   │   ├── routers/
│   │   │   ├── writing.py          # /api/writing/*  — scrape, rewrite, evaluate, history
│   │   │   ├── rules.py            # /api/rules/*    — CRUD, extract (SSE), generate queries
│   │   │   ├── settings.py         # /api/settings/* — API key status, defaults, reset
│   │   │   ├── corpus.py           # /api/corpus/*   — document CRUD, discover, bulk ops (SSE)
│   │   │   ├── corpus_sets.py      # /api/corpus-sets/* — corpus set management
│   │   │   ├── query_sets.py       # /api/query-sets/*  — query set CRUD
│   │   │   ├── jobs.py             # /api/jobs/*     — job polling + persistent active-job flags
│   │   │   └── admin.py            # /api/admin/*    — email whitelist management (super-admin only)
│   │   └── services/
│   │       ├── llm_client.py       # Unified async LLM client (OpenAI, Gemini, Claude)
│   │       ├── article_scraper.py  # URL → clean text (httpx + BeautifulSoup4)
│   │       ├── geo_rewriter.py     # Rule-based article rewriting + multi-ruleset merge
│   │       ├── geo_evaluator.py    # RAG GE simulation + AutoGEO visibility scoring
│   │       ├── document_retriever.py # BM25 ranking + synthetic competitor generation
│   │       ├── query_generator.py  # Topic/article → synthetic search queries
│   │       ├── rule_extractor.py   # 4-stage AutoGEO extraction pipeline (SSE)
│   │       └── web_searcher.py     # DuckDuckGo search for corpus discovery
│   ├── autogeo/                    # Vendored AutoGEO code (MIT, adapted)
│   │   └── prompts/                # Editable prompt templates per pipeline stage
│   ├── data/
│   │   ├── rule_sets/              # Built-in JSON rule sets (seeded on first run)
│   │   ├── seed_queries/           # Default query templates
│   │   └── users/                  # Per-user SQLite databases (git-ignored)
│   │       └── <email_hash>/geo.db
│   ├── requirements.txt
│   ├── .env.example
│   └── run.py
└── frontend/                       # React 18 + TypeScript + Vite + TailwindCSS
    ├── firebase.json               # Firebase Hosting config
    ├── .firebaserc                 # Firebase project binding
    ├── vite.config.ts              # Dev proxy: /api → http://localhost:8000
    └── src/
        ├── config/firebase.ts      # Firebase app init from VITE_FIREBASE_* env vars
        ├── contexts/
        │   ├── AuthContext.tsx      # Firebase auth state, sign-in/out, accessDenied flag
        │   ├── ExtractionContext.tsx # Shared extraction-in-progress flag
        │   └── RulesCorpusContext.tsx # Shared state for Rules & Corpus tab
        ├── components/
        │   ├── LoginPage.tsx        # Google sign-in page
        │   ├── AccessDeniedPage.tsx  # 403 error screen for non-whitelisted users
        │   ├── Layout.tsx           # Main app shell with tabs
        │   ├── WritingAssistant/    # Article input, config, side-by-side, scores, history
        │   ├── RulesAndCorpus/      # QuerySetManager, CorpusLibrary, ExtractRules
        │   ├── Settings/            # API key config, default model
        │   ├── Admin/               # Email whitelist management (super-admin only)
        │   └── shared/              # LoadingSpinner, Toast, MarkdownPreview
        ├── hooks/
        │   ├── useWritingAssistant.ts  # Rewrite + eval with job polling and recovery
        │   ├── useLocalStorage.ts      # Typed localStorage hook
        │   └── useSessionStorage.ts    # Typed sessionStorage hook
        ├── services/api.ts          # Typed Axios client, auth interceptors, job API
        └── types/index.ts           # TypeScript interfaces and GE_MODELS constant
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Axios, Firebase SDK |
| Backend | Python 3.11+, FastAPI, Uvicorn, async httpx, Firebase Admin SDK |
| Database | Per-user SQLite via SQLAlchemy (isolated by email hash) |
| Auth | Firebase Authentication (Google sign-in) + email whitelist |
| LLM APIs | OpenAI, Google Gemini, Anthropic Claude (unified via `llm_client.py`) |
| Retrieval | rank-bm25 (BM25 Okapi) for document ranking |
| Search | ddgs (DuckDuckGo) for corpus document discovery |
| Streaming | sse-starlette for rule extraction and corpus import progress |
| Hosting | Firebase Hosting (frontend) + GCP e2-micro VM (backend) |

### Key Decisions

- **Per-user databases** — Each authenticated user gets `backend/data/users/<sha256_hash>/geo.db`. Complete data isolation without adding `user_id` columns or query filters.
- **Firebase Authentication** — Google sign-in with backend token verification. Email whitelist in `.env` prevents unauthorized LLM API usage.
- **Hardcoded super-admin** — `chlgustjr41@gmail.com` is hardcoded in `backend/app/auth.py`. Cannot be changed without code modification and redeployment.
- **Persistent job flags** — `active_jobs` table in per-user DB persists job state across sign-out/sign-in. Cross-referenced with in-memory `job_manager` on recovery.
- **Background tasks** — Rewrite and GEO evaluation run as `asyncio.create_task()` background jobs, returning a `job_id` immediately. Frontend polls for completion.
- **SSE for extraction** — Rule extraction and corpus import stream progress via Server-Sent Events. Job tracking provides fallback recovery if the SSE connection drops.
- **Vite dev server** proxies `/api` to `http://localhost:8000` — no CORS issues in development.
- **API keys** live in `backend/.env` only — the frontend never sees raw keys.
- **All LLM calls are async** via httpx — blocking calls are forbidden.

---

## 2. Production Deployment

### Infrastructure

| Component | Service | Details |
|-----------|---------|---------|
| Frontend | Firebase Hosting | `geo-rewrite-assistant.web.app` |
| Backend | GCP VM `geo-rewrite-assistant-backend` | e2-micro, Ubuntu 22.04, us-central1-a |
| Backend process | systemd `geo-assistant.service` | Uvicorn on `127.0.0.1:8000` |
| Reverse proxy | Nginx | HTTPS (self-signed cert), SSE support, proxy to :8000 |
| Auth | Firebase project `geo-rewrite-assistant` | Google sign-in provider |

### Backend VM Setup

```bash
# Systemd service (/etc/systemd/system/geo-assistant.service)
[Unit]
Description=GEO Assistant Backend
After=network.target

[Service]
User=root
WorkingDirectory=/opt/geo-assistant/backend
ExecStart=/opt/geo-assistant/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
EnvironmentFile=/opt/geo-assistant/backend/.env

[Install]
WantedBy=multi-user.target
```

### Nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name 34.29.91.25;
    ssl_certificate /etc/ssl/certs/geo-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/geo-selfsigned.key;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}

server {
    listen 80;
    server_name 34.29.91.25;
    return 301 https://$host$request_uri;
}
```

### Deploy Commands

```bash
# Backend (on VM)
cd /opt/geo-assistant
sudo git pull origin master
sudo systemctl restart geo-assistant

# Frontend (from local machine)
cd frontend
npm run build
npx firebase deploy --only hosting

# Or use gcloud SSH for remote backend deploy:
gcloud compute ssh geo-rewrite-assistant-backend \
  --zone=us-central1-a \
  --project=gen-lang-client-0664573611 \
  --command="cd /opt/geo-assistant && sudo git pull origin master && sudo systemctl restart geo-assistant"
```

---

## 3. Authentication & Authorization

### Flow

```
1. User clicks "Sign in with Google" → Firebase popup
2. Firebase returns ID token
3. Frontend attaches token to every API request (Authorization: Bearer <token>)
4. Backend verifies token via Firebase Admin SDK
5. Backend checks email against ALLOWED_EMAILS whitelist
6. 401 → invalid/expired token → frontend signs out
7. 403 → email not whitelisted → frontend shows AccessDeniedPage
```

### Backend Auth Module (`backend/app/auth.py`)

- `SUPER_ADMIN_EMAIL = "chlgustjr41@gmail.com"` — hardcoded, immutable
- `_ensure_firebase()` — lazy Firebase Admin SDK initialization from service account
- `get_current_user(authorization: str)` — verifies Bearer token, checks whitelist, returns user dict or None (when auth disabled)
- `require_admin(user: dict)` — ensures caller is super-admin
- When `FIREBASE_SERVICE_ACCOUNT_PATH` is not set, auth is skipped (local dev mode)

### Router-Level Protection

All routers use `Depends(get_current_user)` at the router level via `deps.py`:

```python
# deps.py
async def get_user_db(user = Depends(get_current_user)):
    email = user.get("email").lower() if user else None
    factory = get_user_session_factory(email)
    db = factory()
    try:
        yield db
    finally:
        db.close()
```

### Admin API (`/api/admin`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/whitelist` | List whitelisted emails + super_admin identifier |
| `POST` | `/api/admin/whitelist` | Add email to whitelist (writes to `.env`) |
| `DELETE` | `/api/admin/whitelist` | Remove email (super-admin cannot be removed) |

---

## 4. Database Schema

### Per-User Database Isolation

Each user gets: `backend/data/users/<sha256(email)[:16]>/geo.db`

On first access, the database is created with all tables, schema migrations are applied, and built-in rule sets are seeded.

### RuleSet

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique identifier |
| `name` | String | Human-readable name |
| `engine_model` | String | Target GE model ID |
| `topic_domain` | String | Domain label (default: `healthcare`) |
| `rules_json` | Text | JSON: `{"filtered_rules": ["rule1", "rule2", ...]}` |
| `num_rules` | Integer | Count of filtered rules |
| `is_builtin` | Boolean | `true` for system-seeded sets (deletion protected) |
| `extraction_metadata_json` | Text (nullable) | JSON: `{queries, query_set_id, corpus_set_ids, corpus_doc_count, source_urls, ge_responses}` |
| `created_at` | DateTime | UTC timestamp |

### Article

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique identifier |
| `title` | String | Article title |
| `source_url` | String (nullable) | Original URL if scraped |
| `original_content` | Text | Original article text |
| `rewritten_content` | Text (nullable) | Optimized version |
| `geo_scores_json` | Text (nullable) | Serialized `MultiGeoEvalResponse` |
| `rule_set_id` | String | Primary rule set ID (legacy compat) |
| `rule_set_ids_json` | Text (nullable) | JSON array of all selected rule set IDs |
| `model_used` | String | LLM model used for rewriting |
| `trend_keywords_json` | Text (nullable) | JSON array of injected keywords |
| `created_at` | DateTime | UTC timestamp |

### QuerySet

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique identifier |
| `name` | String | Human-readable name |
| `topic` | String | Topic domain string |
| `queries_json` | Text | JSON array of query strings |
| `num_queries` | Integer | Count of queries |
| `created_at` | DateTime | UTC timestamp |

### CorpusSet

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique identifier |
| `name` | String | Human-readable name |
| `query_set_id` | String (nullable) | Link to source QuerySet |
| `created_at` | DateTime | UTC timestamp |

### CorpusDocument

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique identifier |
| `title` | String | Document title |
| `source_url` | String (nullable) | Source URL if scraped |
| `content` | Text | Full document text |
| `word_count` | Integer | Word count |
| `query_set_id` | String (nullable) | Source query set |
| `corpus_set_id` | String (nullable) | Parent corpus set |
| `created_at` | DateTime | UTC timestamp |

### ActiveJob

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique identifier |
| `job_type` | String | `"extraction"`, `"rewrite"`, or `"geo_evaluation"` |
| `job_id` | String | In-memory `job_manager` ID |
| `config_json` | Text (nullable) | Request parameters for display |
| `status` | String | `"running"`, `"complete"`, `"error"`, `"stale"` |
| `result_json` | Text (nullable) | Serialized job result |
| `error` | String (nullable) | Error message |
| `created_at` | DateTime | UTC timestamp |

### CompetitorDoc (Legacy Cache)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique identifier |
| `query` | String | Query used to generate |
| `content` | Text | Generated competitor text |
| `source` | String | `"synthetic"` or `"scraped"` |
| `created_at` | DateTime | UTC timestamp |

---

## 5. API Endpoints

### Writing (`/api/writing`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/writing/scrape-url` | Scrape article content from a URL |
| `POST` | `/api/writing/rewrite` | Rewrite article (returns `{job_id}`, runs as background task) |
| `POST` | `/api/writing/evaluate-geo` | Run GEO evaluation (returns `{job_id}`, runs as background task) |
| `POST` | `/api/writing/save` | Save article + rewrite to history |
| `GET` | `/api/writing/history` | List last 50 saved articles |
| `GET` | `/api/writing/history/{id}` | Get full article detail |
| `DELETE` | `/api/writing/history/{id}` | Delete from history |
| `PATCH` | `/api/writing/history/{id}/scores` | Attach GEO scores to a saved article |

### Rules (`/api/rules`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/rules` | List all rule sets (includes `is_deprecated` flag) |
| `POST` | `/api/rules` | Create a custom rule set |
| `GET` | `/api/rules/{id}` | Get rule set with full rules + extraction metadata |
| `PUT` | `/api/rules/{id}` | Update name or rules |
| `DELETE` | `/api/rules/{id}` | Delete (built-in sets protected) |
| `GET` | `/api/rules/{id}/export` | Download rule set as JSON |
| `POST` | `/api/rules/generate-queries` | Generate queries from topic or article content |
| `POST` | `/api/rules/extract` | Run 4-stage AutoGEO pipeline (SSE streaming) |

### Jobs (`/api/jobs`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/jobs` | List running in-memory jobs for current user |
| `GET` | `/api/jobs/{id}` | Get job status, progress, and result |
| `GET` | `/api/jobs/active/list` | List persistent active-job flags (cross-referenced with in-memory state) |
| `POST` | `/api/jobs/active` | Create a persistent active-job flag |
| `DELETE` | `/api/jobs/active/{id}` | Delete a persistent active-job flag |

### Query Sets (`/api/query-sets`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/query-sets` | List all query sets |
| `POST` | `/api/query-sets` | Create from list of queries |
| `GET` | `/api/query-sets/{id}` | Get query set with queries |
| `DELETE` | `/api/query-sets/{id}` | Delete query set |

### Corpus (`/api/corpus`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/corpus` | List all corpus documents |
| `GET` | `/api/corpus/count` | Total document count |
| `POST` | `/api/corpus/add-text` | Add raw text as a document |
| `POST` | `/api/corpus/add-url` | Scrape URL and add as document |
| `POST` | `/api/corpus/bulk-add-urls` | Scrape and add multiple URLs (SSE streaming) |
| `POST` | `/api/corpus/discover-from-queryset` | DuckDuckGo search via query set |
| `POST` | `/api/corpus/bulk-delete` | Delete multiple documents by ID list |
| `DELETE` | `/api/corpus/{id}` | Delete single document |
| `GET` | `/api/corpus/audit-binary` | Find corrupted documents |
| `POST` | `/api/corpus/purge-binary` | Delete all binary-content documents |

### Corpus Sets (`/api/corpus-sets`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/corpus-sets` | List all corpus sets |
| `POST` | `/api/corpus-sets` | Create a new corpus set |
| `PUT` | `/api/corpus-sets/{id}` | Rename a corpus set |
| `DELETE` | `/api/corpus-sets/{id}` | Cascade-delete corpus set and documents |
| `GET` | `/api/corpus-sets/{id}/documents` | List documents in a corpus set |

### Settings (`/api/settings`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Get masked key statuses + defaults |
| `PUT` | `/api/settings/defaults` | Update default model / rule set |
| `POST` | `/api/settings/reset-workspace` | Clear caches and input state |
| `POST` | `/api/settings/reset-rules-corpus` | Delete all non-builtin rules, corpus, and query sets |

### Admin (`/api/admin`) — Super-admin only

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/whitelist` | List whitelisted emails |
| `POST` | `/api/admin/whitelist` | Add email to whitelist |
| `DELETE` | `/api/admin/whitelist` | Remove email from whitelist |

---

## 6. Job Tracking System

### Two-Layer Architecture

1. **In-memory `job_manager`** — Fast, real-time progress updates via polling. Jobs auto-clean after 1 hour. Lost on server restart.

2. **Persistent `active_jobs` table** — Per-user SQLite rows that survive sign-out, refresh, and server restarts. Cross-referenced with in-memory state on recovery.

### Job Lifecycle

```
Request received
  → Create in-memory job (job_manager.create_job)
  → Write persistent flag (ActiveJob row in user's DB)
  → Spawn asyncio background task
  → Return {job_id} to frontend

Task running
  → job_manager.update_progress() on each stage
  → Frontend polls GET /api/jobs/{id} every 3 seconds

Task complete/error
  → job_manager.complete_job() or fail_job()
  → Update ActiveJob row status to "complete"/"error"
  → Frontend detects completion, cleans up flag via DELETE /api/jobs/active/{id}

Recovery (sign-out/sign-in or refresh)
  → Frontend calls GET /api/jobs/active/list
  → Backend cross-refs DB flags with in-memory jobs:
    - Running in memory → return progress, frontend resumes polling
    - Complete in memory → return result, update DB flag
    - Gone from memory → mark as "stale", notify user
```

### Covered Operations

| Operation | Job Type | Progress Tracking |
|-----------|----------|-------------------|
| Rule extraction | `extraction` | Stage (bm25, explainer, extractor, merger, filter) + completed/total |
| Article rewrite | `rewrite` | Stage (starting, merging_rules, rewriting) |
| GEO evaluation | `geo_evaluation` | Stage (starting, evaluating) + completed/total queries |
| Corpus import | `corpus_import` | Completed/total URLs |

---

## 7. GEO Evaluation Pipeline

Reproduces the methodology from the AutoGEO paper (Wu et al., ICLR 2026).

### Evaluation Flow

```
1. Test Query
   ├── Auto-generated from article content via LLM (single mode)
   └── Sampled from query set (batch mode)

2. Competing Document Assembly
   ├── Corpus-based (>=10 docs): BM25-ranked real corpus documents
   └── Synthetic fallback (<10 docs): LLM-generated competitors (5 quality tiers)

3. RAG Simulation (run twice: original article, then optimized)
   ├── Assemble: [target_article] + [top-K competitors]
   ├── BM25-rank all documents for the test query
   ├── Format as numbered [Source N] blocks
   └── LLM generates cited answer using only provided sources

4. Scoring
   ├── Word Visibility (V_word)
   ├── Position Visibility (V_pos)
   ├── Overall Visibility (V_overall)
   ├── GEU (Generative Engine Utilization)
   └── Improvement percentages (before → after)
```

### Visibility Metrics

| Metric | Formula | Description |
|--------|---------|-------------|
| V_word | `\|words(d) ∩ words(R)\| / \|words(d)\|` | Fraction of article vocabulary in GE response |
| V_pos | `Σ (1/pos(w,R)) / \|words(d)\|` | Position-weighted vocabulary overlap |
| V_overall | `(V_word + V_pos) / 2` | Primary headline metric |
| GEU | `target_citations / total_citations × 100` | Share of citations pointing to target article |

### Multi-Engine & Batch Mode

- **Multi-engine:** When selected rule sets target multiple GE models, each gets its own simulation. A combined average is also produced.
- **Batch mode:** N queries sampled from query set, evaluated independently, then aggregated per-model and overall.

---

## 8. Rule Extraction Pipeline (AutoGEO 4-Stage)

### Prerequisites

- Query set with >= 5 queries
- Corpus set with >= 5 documents (`MIN_CORPUS_DOCS = 5`)
- API key for the target GE model

### Stages

| Stage | Description |
|-------|-------------|
| **1. Explainer** | For each query: BM25 retrieve top 5 from corpus → GE simulation → identify high/low visibility pair → LLM explains the visibility gap |
| **2. Extractor** | LLM converts each explanation into structured, actionable rules |
| **3. Merger** | Deduplicate and consolidate rules in chunks of 50, merge hierarchically |
| **4. Filter** | LLM removes vague or non-actionable rules. Output: 15-30 high-quality rules |

### Progress Streaming

SSE events with stage, completed/total counts, and model info. Persistent active-job flag created in user's DB for recovery.

### Cost Estimates

| Queries | Flash Lite | Flash | Pro |
|---------|-----------|-------|-----|
| 10 | ~$0.15 | ~$0.30 | ~$0.80 |
| 20 | ~$0.30 | ~$0.60 | ~$1.50 |
| 30 | ~$0.50 | ~$1.00 | ~$2.50 |

---

## 9. Article Rewriting

### Single Rule Set

LLM rewrites the article following filtered rules while preserving factual accuracy, E-E-A-T signals, and targeting 6th-8th grade reading level.

### Multi-Rule Set Merge

When multiple rule sets are selected: concatenate all rules → LLM deduplicates and resolves conflicts → produces a single 15-30 rule list → used for the rewrite.

---

## 10. Supported GE Models

```typescript
GE_MODELS = [
  // Google Gemini
  { id: 'gemini-2.5-flash-lite',       provider: 'google',    tier: 'fast' },
  { id: 'gemini-2.5-flash',            provider: 'google',    tier: 'standard' },
  { id: 'gemini-2.5-pro',              provider: 'google',    tier: 'standard' },
  { id: 'gemini-3-flash-preview',      provider: 'google',    tier: 'fast' },
  // OpenAI
  { id: 'gpt-4o-mini',                 provider: 'openai',    tier: 'fast' },
  { id: 'gpt-4.1-mini',               provider: 'openai',    tier: 'fast' },
  { id: 'o4-mini',                     provider: 'openai',    tier: 'fast' },
  { id: 'gpt-4o',                      provider: 'openai',    tier: 'standard' },
  { id: 'gpt-4.1',                     provider: 'openai',    tier: 'standard' },
  { id: 'gpt-4.5',                     provider: 'openai',    tier: 'standard' },
  // Anthropic Claude
  { id: 'claude-haiku-4-5-20251001',   provider: 'anthropic', tier: 'fast' },
  { id: 'claude-sonnet-4-6',           provider: 'anthropic', tier: 'standard' },
  { id: 'claude-opus-4-6',             provider: 'anthropic', tier: 'standard' },
]
```

---

## 11. Dependencies

### Backend (`requirements.txt`)

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn[standard]` | ASGI server |
| `sqlalchemy` | ORM + SQLite |
| `httpx` | Async HTTP client (all LLM calls) |
| `beautifulsoup4` | HTML parsing for article scraping |
| `rank-bm25` | BM25 Okapi document ranking |
| `openai` | OpenAI API client |
| `anthropic` | Anthropic Claude API client |
| `google-generativeai` | Google Gemini API client |
| `firebase-admin` | Firebase Admin SDK (token verification) |
| `python-dotenv` | .env file loading |
| `pydantic` | Request/response validation |
| `sse-starlette` | Server-Sent Events streaming |
| `aiofiles` | Async file I/O |
| `ddgs` | DuckDuckGo search (corpus discovery) |

### Frontend

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` | UI framework |
| `typescript` | Type safety |
| `vite` | Build tool + dev server |
| `tailwindcss` | Utility-first CSS |
| `axios` | HTTP client |
| `firebase` | Firebase SDK (auth) |
| `lucide-react` | Icon library |

---

## 12. Security

| Concern | Mitigation |
|---------|-----------|
| Authentication | Google sign-in via Firebase; ID tokens verified by Firebase Admin SDK on every request |
| Authorization | Email whitelist in `backend/.env`; super-admin hardcoded in source |
| API key exposure | Keys stored in `backend/.env` only; masked in all API responses; `.env` written with `chmod 600` |
| Frontend key access | Frontend never stores or receives raw LLM API keys |
| User isolation | Separate SQLite databases per user; email hash used for directory naming |
| Service account | `service-account.json` is git-ignored; deployed manually |
| Network | Nginx HTTPS reverse proxy; CORS restricted via `CORS_ORIGINS` env var |
| Admin immutability | Super-admin email hardcoded; cannot be changed via API |
| Secrets in git | `.env`, `*.db`, `.claude/`, `service-account.json`, `backend/data/users/` all in `.gitignore` |

---

## 13. References

### Academic Papers

1. **AutoGEO** — Wu, J., Zhong, Z., Kim, S., Xiong, C. *"What Generative Search Engines Like and How to Optimize Web Content Cooperatively."* ICLR 2026. GitHub: https://github.com/cxcscmu/AutoGEO (MIT License)

2. **GEO** — Aggarwal, P. et al. *"GEO: Generative Engine Optimization."* arXiv:2311.09735, 2023.

### Open-Source Projects

| Project | License | Usage |
|---------|---------|-------|
| [AutoGEO](https://github.com/cxcscmu/AutoGEO) | MIT | Vendored in `backend/autogeo/` |
| [rank-bm25](https://github.com/dorianbrown/rank_bm25) | Apache 2.0 | BM25 Okapi document ranking |
| [sse-starlette](https://github.com/sysid/sse-starlette) | BSD | SSE streaming |
| [ddgs](https://github.com/deedy5/duckduckgo_search) | MIT | Web search for corpus discovery |
| [FastAPI](https://github.com/tiangolo/fastapi) | MIT | Backend web framework |
| [Vite](https://github.com/vitejs/vite) | MIT | Frontend build tool |
| [Firebase](https://firebase.google.com/) | Apache 2.0 | Authentication + Hosting |
