# CareYaya GEO Assistant

A local web application that helps non-technical staff optimize blog content for AI-powered search engines (ChatGPT, Gemini, Perplexity) using the **AutoGEO** framework from Wu et al., ICLR 2026.

## Features

| Tab | What it does |
|-----|-------------|
| **Writing Assistant** | Paste or scrape a CareYaya article, select a GE model + rule set, and receive an AI-optimized rewrite with before/after GEO visibility scores |
| **Trends** | Discover trending healthcare keywords via Google Trends, select relevant ones, and inject them into the Writing Assistant |
| **Rules & Training** | Extract new GEO rule sets from scratch using the AutoGEO 4-stage pipeline; export AutoGEOMini training packages |
| **Settings** | Configure API keys for OpenAI, Gemini, and Anthropic; set default model and target website |

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- API key for at least one of: OpenAI, Google Gemini, or Anthropic

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/Scripts/activate   # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your API keys
python run.py
# → http://localhost:8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Open `http://localhost:5173` and go to **Settings** first to verify your API keys are loaded.

## Environment Variables

Create `backend/.env` from `backend/.env.example`. The file is git-ignored and must never be committed.

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | For GPT models | OpenAI API key (`sk-...`) |
| `GOOGLE_API_KEY` | For Gemini models | Google AI Studio key (`AI...`) |
| `ANTHROPIC_API_KEY` | For Claude models | Anthropic key (`sk-ant-...`) |
| `TARGET_WEBSITE` | No | Default URL for scraping (default: `https://careyaya.org`) |
| `DEFAULT_MODEL` | No | Default GE model (default: `gemini-2.5-flash-lite`) |
| `DEFAULT_RULE_SET` | No | Default rule set ID |

At least one API key must be set. The cheapest option for most operations is `gemini-2.5-flash-lite`.

## Architecture

```
geo-assistant/
├── backend/                   # FastAPI + Python
│   ├── app/
│   │   ├── main.py            # App entrypoint, CORS, router mounts, startup seed
│   │   ├── config.py          # .env reader/writer
│   │   ├── database.py        # SQLAlchemy + SQLite
│   │   ├── models.py          # RuleSet, Article, CompetitorDoc, TrendCache
│   │   ├── seed.py            # Seeds built-in rule sets on first run
│   │   ├── routers/
│   │   │   ├── writing.py     # /api/writing/* — scrape, rewrite, history
│   │   │   ├── trends.py      # /api/trends/* — discover
│   │   │   ├── rules.py       # /api/rules/* — CRUD, extract (SSE), export
│   │   │   └── settings.py    # /api/settings/* — keys, test, defaults
│   │   └── services/
│   │       ├── llm_client.py       # Unified async httpx client (OpenAI/Gemini/Claude)
│   │       ├── article_scraper.py  # URL → clean text (httpx + BeautifulSoup4)
│   │       ├── geo_rewriter.py     # AutoGEO rule-based rewriting
│   │       ├── trend_service.py    # trendspyg + 24h SQLite cache
│   │       ├── query_generator.py  # Topic → synthetic search queries
│   │       ├── rule_extractor.py   # 4-stage extraction pipeline (SSE)
│   │       ├── geo_evaluator.py    # RAG simulation + GEO scoring (Phase 3)
│   │       └── document_retriever.py # BM25 + synthetic competitors (Phase 3)
│   ├── autogeo/
│   │   └── prompts/           # Editable prompt templates for each pipeline stage
│   ├── data/
│   │   ├── rule_sets/         # Built-in JSON rule sets (auto-seeded on first run)
│   │   └── seed_queries/      # Query templates for caregiving domain
│   ├── requirements.txt
│   ├── .env.example           # Template — copy to .env and fill in keys
│   └── run.py                 # uvicorn launcher
└── frontend/                  # React 18 + TypeScript + Vite + TailwindCSS
    └── src/
        ├── components/
        │   ├── WritingAssistant/
        │   ├── TrendDiscovery/
        │   ├── RuleTraining/
        │   ├── Settings/
        │   └── shared/        # LoadingSpinner, Toast, MarkdownPreview
        ├── hooks/             # useWritingAssistant, useTrends, useRuleExtraction
        ├── services/api.ts    # Typed Axios client for all endpoints
        └── types/index.ts     # Shared TypeScript interfaces and constants
```

## API Endpoints

### Writing
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/writing/scrape-url` | Scrape article text from a URL |
| `POST` | `/api/writing/rewrite` | Rewrite article using selected rule set + trend keywords |
| `POST` | `/api/writing/evaluate-geo` | Run full RAG GEO evaluation *(Phase 3)* |
| `POST` | `/api/writing/save` | Save article to history |
| `GET`  | `/api/writing/history` | List saved articles |

### Trends
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/trends/discover` | Fetch Google Trends data with 24h caching |

### Rules
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/rules` | List all rule sets |
| `GET`  | `/api/rules/{id}` | Get rule set with full rules |
| `PUT`  | `/api/rules/{id}` | Update name or rules |
| `DELETE` | `/api/rules/{id}` | Delete (built-in sets protected) |
| `GET`  | `/api/rules/{id}/export` | Download as JSON |
| `POST` | `/api/rules/generate-queries` | Generate synthetic queries for a topic |
| `POST` | `/api/rules/extract` | SSE stream: run 4-stage AutoGEO pipeline |
| `POST` | `/api/rules/export-training-package` | Download AutoGEOMini training ZIP |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/settings` | Get masked key statuses + defaults |
| `POST` | `/api/settings/api-keys` | Save an API key to `.env` |
| `POST` | `/api/settings/test-key` | Test if a provider key works |
| `PUT`  | `/api/settings/defaults` | Update target website / default model |

## GEO Models Supported

| Model ID | Provider | Tier |
|----------|----------|------|
| `gemini-2.5-flash-lite` | Google | Fast / cheap |
| `gemini-2.5-flash` | Google | Standard |
| `gpt-4o-mini` | OpenAI | Fast / cheap |
| `gpt-4o` | OpenAI | Standard |
| `claude-3-5-haiku-20241022` | Anthropic | Fast / cheap |
| `claude-3-5-sonnet-20241022` | Anthropic | Standard |

## Built-in Rule Sets

Three rule sets are automatically seeded into the database on first run:

- **Healthcare General v1 (Gemini)** — 10 rules tuned for Gemini citation patterns
- **Healthcare General v1 (GPT)** — 10 rules tuned for GPT citation patterns
- **Healthcare General v1 (Claude)** — 10 rules tuned for Claude citation patterns

These cannot be deleted. Custom rule sets can be extracted via the Rules & Training tab.

## Rule Extraction Cost Estimates

| Queries | Flash Lite | Flash |
|---------|-----------|-------|
| 10 queries | ~$0.15 | ~$0.30 |
| 20 queries | ~$0.30 | ~$0.60 |
| 30 queries | ~$0.50 | ~$1.00 |

Extraction takes 3–8 minutes depending on query count and model.

## Security

- API keys are stored in `backend/.env` only — never sent to or stored in the frontend
- `.env` is git-ignored; `backend/.env.example` is the safe-to-commit template
- The SQLite database is local-only and also git-ignored
- API keys are masked in all Settings API responses
- Designed for local use only — no authentication layer is included

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1 — Foundation | ✅ Complete | Scaffold, DB, LLM client, Settings tab, rule set seeding |
| 2 — Writing Core | ✅ Complete | `geo_rewriter.py`, rewrite endpoint |
| 3 — GEO Evaluation | 🔲 Pending | RAG pipeline, scoring, score panel UI |
| 4 — Trend Discovery | ✅ Complete | `trend_service.py`, trendspyg, 24h caching |
| 5 — Rule Extraction | ✅ Complete | 4-stage AutoGEO pipeline, SSE streaming, training export |
| 6 — Polish | 🔲 Pending | Loading states, error handling, demo flow validation |

## References

- Wu et al., *AutoGEO: Automated Generative Engine Optimization*, ICLR 2026
- [trendspyg](https://github.com/GeneralMills/trendspyg) — Google Trends Python client (active pytrends replacement)
- [rank-bm25](https://github.com/dorianbrown/rank_bm25) — BM25 document ranking
- [sse-starlette](https://github.com/sysid/sse-starlette) — Server-Sent Events for FastAPI
