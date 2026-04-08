# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GEO Rewrite Assistant — a web app helping content teams optimize articles for AI-powered search engines (ChatGPT, Gemini, Perplexity) using the AutoGEO framework (Wu et al., ICLR 2026). Two tabs: **Writing Assistant** (rewrite + evaluate) and **Rules & Corpus** (query sets, corpus, rule extraction). Plus **Settings** and **Admin** (super-admin whitelist management).

**Live:** https://geo-rewrite-assistant.web.app

## Commands

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # then add API keys
python run.py              # http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
npm run build  # TypeScript check + Vite production build
```

### Deployment
```bash
# Frontend → Firebase Hosting
cd frontend && npm run build && npx firebase deploy --only hosting

# Backend → GCP VM (project: personal-server, instance: personal-project-machine)
# The backend runs as a Docker container alongside other project backends.
gcloud compute ssh personal-project-machine \
  --zone=us-east1-b \
  --project=personal-server-492701 \
  --command="cd /opt/geo-assistant && sudo git pull origin master && sudo docker compose up -d --build"
```

### Docker (Backend)
```bash
# Local build & run
docker compose up -d --build

# View logs
docker compose logs -f geo-assistant-backend

# Stop
docker compose down
```

## Architecture

### Tech Stack
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS (no custom CSS files), Axios, Firebase SDK, @tanstack/react-query
- **Backend:** Python 3.11+, FastAPI, Uvicorn (async throughout — httpx only, no requests), Firebase Admin SDK
- **Database:** Per-user SQLite via SQLAlchemy (`backend/data/users/<sha256_hash>/geo.db`)
- **Auth:** Firebase Authentication (Google sign-in) + email whitelist in `.env`
- **LLM APIs:** OpenAI, Google Gemini, Anthropic Claude (unified via `llm_client.py`)
- **Retrieval:** rank-bm25 for GEO evaluation document ranking
- **Search:** ddgs (DuckDuckGo) for corpus document discovery
- **Hosting:** Firebase Hosting (frontend) + GCP VM `personal-project-machine` (Docker container, Nginx HTTPS reverse proxy)

### Key Architecture Decisions
- **Per-user databases** — each authenticated user gets their own SQLite DB. Complete data isolation.
- **Firebase Auth** — Google sign-in with backend token verification. Email whitelist prevents unauthorized LLM API usage. Auth bypassed when `VITE_FIREBASE_API_KEY` is not set (local dev).
- **Background jobs** — Rewrite and GEO evaluation run as `asyncio.create_task()`, return `{job_id}` immediately. Frontend polls `GET /api/jobs/{id}` every 3s.
- **Persistent job flags** — `active_jobs` table in per-user DB survives sign-out/sign-in. Cross-referenced with in-memory `job_manager` on recovery.
- **SSE for extraction** — Rule extraction and corpus import stream progress via Server-Sent Events.
- Vite dev server proxies `/api` → `http://localhost:8000` (see `vite.config.ts`)
- API keys live in `backend/.env` only — never sent to or stored in the frontend
- All LLM calls are async (httpx); blocking calls are forbidden

### Backend Data Flow
```
FastAPI (main.py) — all routers protected by Depends(get_current_user)
  ├── /api/writing/*      → writing.py      → geo_rewriter.py + geo_evaluator.py (job-based)
  ├── /api/rules/*        → rules.py        → rule_extractor.py (SSE progress stream)
  ├── /api/corpus/*       → corpus.py       → document CRUD, discover, bulk import (SSE)
  ├── /api/corpus-sets/*  → corpus_sets.py  → corpus set management
  ├── /api/query-sets/*   → query_sets.py   → query set CRUD
  ├── /api/jobs/*         → jobs.py         → job polling + persistent active-job flags
  ├── /api/settings/*     → settings.py     → API key status, defaults, reset
  └── /api/admin/*        → admin.py        → email whitelist (super-admin only)
```

### Database Models
- `RuleSet` — named rule collections; `is_builtin=True` prevents deletion of shipped defaults
- `Article` — rewrite history with GEO scores
- `QuerySet` — named collections of search queries for evaluation and extraction
- `CorpusSet` — grouped collections of corpus documents
- `CorpusDocument` — competing documents for GEO evaluation (scraped or manual)
- `ActiveJob` — persistent job flags for recovery across sign-out/sign-in
- `CompetitorDoc` — legacy cache of synthetic competitor documents

### AutoGEO Vendored Code (`backend/autogeo/`)
Adapted from github.com/cxcscmu/AutoGEO (MIT). Key changes from original:
- Sync API calls replaced with async httpx
- Progress callbacks added to `extract_rules` for SSE streaming
- Healthcare-specific prompt additions in `rewriters.py`
- Prompts extracted to editable `backend/autogeo/prompts/*.txt`

## Environment Variables

### Backend (`backend/.env`)
```
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AI...
ANTHROPIC_API_KEY=sk-ant-...
FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json
ALLOWED_EMAILS=user1@gmail.com,user2@gmail.com
CORS_ORIGINS=https://geo-rewrite-assistant.web.app,https://geo-rewrite-assistant.firebaseapp.com,http://localhost:5173
DEFAULT_MODEL=gemini-2.5-flash-lite
```

### Frontend (`frontend/.env`)
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_API_BASE_URL=https://34.29.91.25.nip.io   # omit for local dev (uses Vite proxy)
```
