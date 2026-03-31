# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CareYaya GEO Assistant — a tabbed local web app helping non-technical staff optimize blog content for AI-powered search engines using the AutoGEO framework (ICLR 2026). Three features: GEO Writing Assistant, Trend Discovery, Rule Extraction & Training Config.

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

## Architecture

### Tech Stack
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS (no custom CSS files), Recharts, Axios
- **Backend:** Python 3.11+, FastAPI, Uvicorn (async throughout — httpx only, no requests)
- **Database:** SQLite via SQLAlchemy (`backend/data/careyaya_geo.db`) — zero-config
- **LLM APIs:** OpenAI, Google Gemini, Anthropic Claude (unified via `llm_client.py`)
- **Trends:** trendspyg (active replacement for deprecated pytrends)
- **Retrieval:** rank-bm25 for GEO evaluation document ranking

### Key Architecture Decisions
- Vite dev server proxies `/api` → `http://localhost:8000` (see `vite.config.ts`)
- API keys live in `backend/.env` only — never sent to or stored in the frontend
- Long-running tasks (rule extraction ~3-5 min) use SSE via `sse-starlette`
- Pre-built rule sets auto-seed into DB on first run from `backend/data/rule_sets/*.json`
- All LLM calls are async (httpx); blocking calls are forbidden

### Backend Data Flow
```
FastAPI (main.py)
  ├── /api/writing/*  → writing.py   → geo_rewriter.py + geo_evaluator.py
  ├── /api/trends/*   → trends.py    → trend_service.py (24h SQLite cache)
  ├── /api/rules/*    → rules.py     → rule_extractor.py (SSE progress stream)
  └── /api/settings/* → settings.py → reads/writes .env file
```

### GEO Evaluation Pipeline (`geo_evaluator.py`)
The core demo feature — reproduces AutoGEO paper (Wu et al., ICLR 2026) Equation 1:
1. Auto-generate a test query from article content (cheapest LLM)
2. Build 5-doc competing set: BM25-ranked DB articles + LLM-generated synthetic competitors
3. Simulate RAG generative engine (prompt: sources → cited answer) — run TWICE (original + optimized)
4. Score: Word = cited words / total response words × 100; Pos = position-weighted variant; Overall = (Word + Pos) / 2
5. Return before/after scores, both GE responses, per-source citation breakdown

### Rule Extraction Pipeline (`rule_extractor.py`)
AutoGEO 4-stage pipeline: **Explainer → Extractor → Merger → Filter**
- Uses LLM-generated synthetic documents (5 quality tiers per query) since ClueWeb22 is unavailable locally
- Progress streamed via SSE; hierarchical Merger chunks insights in groups of 50
- Cost estimate: ~$0.30–0.80 per run

### Database Models
- `RuleSet` — named rule collections; `is_builtin=True` prevents deletion of shipped defaults
- `Article` — rewrite history with GEO scores
- `CompetitorDoc` — cached synthetic competitor documents (reused across evaluations)
- `TrendCache` — Google Trends results with 24h TTL

### AutoGEO Vendored Code (`backend/autogeo/`)
Adapted from github.com/cxcscmu/AutoGEO (MIT). Key changes from original:
- Sync API calls replaced with async httpx
- Progress callbacks added to `extract_rules` for SSE streaming
- Healthcare-specific prompt additions in `rewriters.py`
- Prompts extracted to editable `backend/autogeo/prompts/*.txt`

## Environment Variables

The user must manually create `backend/.env` from `backend/.env.example`. Required keys:
```
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AI...
ANTHROPIC_API_KEY=sk-ant-...
```

## Implementation Phases (from PRODUCTION.md)

1. **Foundation** — Vite+FastAPI scaffold, SQLite models, llm_client, article_scraper, Settings tab, rule set seeding
2. **Writing Assistant Core** — geo_rewriter, side-by-side UI, rewrite/scrape endpoints
3. **GEO Evaluation** — document_retriever (BM25), geo_evaluator, score panel UI
4. **Trend Discovery** — trend_service (trendspyg), recharts line chart, keyword send
5. **Rule Extraction & Training** — query_generator, rule_extractor (SSE), Rule Set Manager, AutoGEOMini export
6. **Polish** — loading states, empty states, toasts, responsive layout
