# GEO Assistant — Technical Specification

Full technical reference for the GEO Assistant system. For setup instructions and workflow overview, see [README.md](README.md).

---

## 1. Architecture Overview

```
geo-assistant/
├── backend/                        # Python 3.11+ / FastAPI
│   ├── app/
│   │   ├── main.py                 # App entrypoint, CORS, router mounts, DB migrations
│   │   ├── config.py               # .env reader/writer, key validation
│   │   ├── database.py             # SQLAlchemy engine + SQLite session factory
│   │   ├── models.py               # ORM models (RuleSet, Article, QuerySet, CorpusSet, CorpusDocument)
│   │   ├── seed.py                 # Model ID migration on startup
│   │   ├── routers/
│   │   │   ├── writing.py          # /api/writing/*  — scrape, rewrite, evaluate, history
│   │   │   ├── rules.py            # /api/rules/*    — CRUD, extract (SSE), generate queries
│   │   │   ├── settings.py         # /api/settings/* — API key status, defaults
│   │   │   ├── corpus.py           # /api/corpus/*   — document CRUD, discover, bulk ops
│   │   │   ├── corpus_sets.py      # /api/corpus-sets/* — corpus set management
│   │   │   └── query_sets.py       # /api/query-sets/*  — query set CRUD
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
│   │   └── seed_queries/           # Default query templates
│   ├── requirements.txt
│   ├── .env.example                # Template — copy to .env, fill in keys
│   └── run.py                      # Uvicorn launcher
└── frontend/                       # React 18 + TypeScript + Vite + TailwindCSS
    ├── vite.config.ts              # Dev proxy: /api → http://localhost:8000
    └── src/
        ├── components/
        │   ├── WritingAssistant/   # Article input, config, side-by-side, scores, history
        │   ├── RulesAndCorpus/     # QuerySetManager, CorpusLibrary
        │   ├── RuleTraining/       # RuleExtractor (SSE), RuleSetManager
        │   ├── Settings/           # API key config, default model
        │   └── shared/             # LoadingSpinner, Toast, MarkdownPreview
        ├── hooks/                  # useWritingAssistant, useRuleExtraction, useLocalStorage
        ├── contexts/               # RulesCorpusContext (shared state for Rules & Corpus tab)
        ├── services/api.ts         # Typed Axios client for all endpoints
        └── types/index.ts          # TypeScript interfaces and GE_MODELS constant
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Axios |
| Backend | Python 3.11+, FastAPI, Uvicorn, async httpx |
| Database | SQLite via SQLAlchemy (zero-config, local) |
| LLM APIs | OpenAI, Google Gemini, Anthropic Claude (unified via `llm_client.py`) |
| Retrieval | rank-bm25 (BM25 Okapi) for document ranking |
| Search | ddgs (DuckDuckGo) for corpus document discovery |
| Streaming | sse-starlette for rule extraction progress |

### Key Decisions

- **Vite dev server** proxies `/api` to `http://localhost:8000` — no CORS issues in development.
- **API keys** live in `backend/.env` only — the frontend never sees raw keys.
- **All LLM calls are async** via httpx — blocking calls (e.g., `requests`) are forbidden.
- **Long-running tasks** (rule extraction, 3-8 min) stream progress via Server-Sent Events.
- **Session storage** for rewrite results — cleared on tab close so the original-content baseline is never stale.
- **Local storage** for article text — survives page refresh so users don't lose work.

---

## 2. Database Schema

### RuleSet

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique identifier |
| `name` | String | Human-readable name |
| `engine_model` | String | Target GE model ID (e.g., `gemini-2.5-flash`) |
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
| `title` | String | Article title (auto-extracted or first line) |
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

### CompetitorDoc (Legacy Cache)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique identifier |
| `query` | String | Query used to generate |
| `content` | Text | Generated competitor text |
| `source` | String | `"synthetic"` or `"scraped"` |
| `created_at` | DateTime | UTC timestamp |

---

## 3. API Endpoints

### Writing (`/api/writing`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/writing/scrape-url` | Scrape article content from a URL (4-strategy extraction) |
| `POST` | `/api/writing/rewrite` | Rewrite article using merged rule sets |
| `POST` | `/api/writing/evaluate-geo` | Run GEO evaluation (single or batch mode) |
| `POST` | `/api/writing/save` | Save article + rewrite to history |
| `GET` | `/api/writing/history` | List last 50 saved articles with metadata |
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
| `POST` | `/api/corpus/bulk-add-urls` | Scrape and add multiple URLs (max 50, 5 concurrent) |
| `POST` | `/api/corpus/discover-from-queryset` | DuckDuckGo search via query set to discover URLs |
| `POST` | `/api/corpus/bulk-delete` | Delete multiple documents by ID list |
| `DELETE` | `/api/corpus/{id}` | Delete single document |
| `GET` | `/api/corpus/audit-binary` | Find documents with binary/corrupted content |
| `POST` | `/api/corpus/purge-binary` | Delete all binary-content documents |

### Corpus Sets (`/api/corpus-sets`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/corpus-sets` | List all corpus sets (includes `is_deprecated`, doc counts) |
| `POST` | `/api/corpus-sets` | Create a new corpus set |
| `PUT` | `/api/corpus-sets/{id}` | Rename a corpus set |
| `DELETE` | `/api/corpus-sets/{id}` | Cascade-delete corpus set and all its documents |
| `GET` | `/api/corpus-sets/{id}/documents` | List documents in a corpus set |

### Settings (`/api/settings`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Get masked key statuses + defaults |
| `PUT` | `/api/settings/defaults` | Update default model / rule set |

---

## 4. GEO Evaluation Pipeline

The evaluation pipeline reproduces the methodology from the AutoGEO paper (Wu et al., ICLR 2026) to measure how visible an article is in AI-generated search responses.

### 4.1 Evaluation Flow

```
1. Test Query
   ├── Auto-generated from article content via LLM (single mode)
   └── Sampled from query set (batch mode)

2. Competing Document Assembly
   ├── Corpus-based (≥10 docs): BM25-ranked real corpus documents
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

### 4.2 Visibility Metrics

All metrics are from the AutoGEO paper (Wu et al., ICLR 2026, Equation 1).

#### Word Inclusion Visibility (`V_word`)

Measures what fraction of the article's unique vocabulary appears in the GE response:

```
V_word(d, R) = |words(d) ∩ words(R)| / |words(d)|
```

- `d` = target article text
- `R` = generative engine response text
- `words(x)` = set of unique lowercase tokens in text x
- Range: 0.0 (no words cited) to 1.0 (all words appear in response)
- Displayed as percentage (0-100%)

**Intuition:** If more of your article's vocabulary shows up in the AI response, the AI engine is drawing more heavily from your content.

#### Position-Adjusted Visibility (`V_pos`)

Weights word matches by how early they appear in the GE response (earlier = more prominent):

```
V_pos(d, R) = Σ_{w ∈ words(d) ∩ words(R)} (1 / pos(w, R)) / |words(d)|
```

- `pos(w, R)` = 1-indexed position of the first occurrence of word `w` in R
- Words appearing at position 1 contribute 1.0, at position 10 contribute 0.1, etc.
- Range: 0.0 to 1.0; displayed as percentage
- Always ≤ `V_word` because each matching word contributes ≤ 1.0

**Intuition:** An article that gets cited at the top of an AI response is more visible than one cited only in a closing sentence.

#### Overall Visibility (`V_overall`)

Simple average of the two visibility metrics:

```
V_overall = (V_word + V_pos) / 2
```

#### Generative Engine Utilization (`GEU`)

Measures what share of explicit source citations in the GE response point to the target article:

```
GEU = (count of [Source N] citations to target / total [Source N] citations) × 100
```

- Parsed via regex from the simulated GE response
- Range: 0% (never cited) to 100% (only source cited)

**Intuition:** Even if the AI uses your words, GEU tells you whether it formally attributes them to your source.

#### Improvement Calculation

All improvements are relative percentage change:

```
improvement_pct = ((after - before) / before) × 100
```

Special case: if `before = 0` and `after > 0`, improvement is reported as +100%.

### 4.3 Multi-Engine Evaluation

When the selected rule sets target multiple GE models (e.g., one rule set for Gemini, another for GPT), the evaluation runs separately for each engine:

- Each model gets its own BM25 retrieval and GE simulation.
- Per-model results are returned individually.
- A **Combined Average** aggregates scores across all models.

### 4.4 Batch Mode

When batch mode is enabled:

1. N queries are randomly sampled from the linked query set (`random.sample`).
2. Each query is independently evaluated (full BM25 + GE simulation per query per model).
3. Per-query results are grouped, then aggregated:
   - **Per-model averages** across all queries.
   - **Combined average** across all models and queries.

### 4.5 Source Citation Metadata

Each source in the evaluation result includes:

| Field | Description |
|-------|-------------|
| `source_id` | Slot number in the retrieval list |
| `label` | `"Your Article"`, `"Corpus Doc N"`, or `"Synthetic Competitor N"` |
| `word_score` | Word visibility % for this individual source |
| `cited` | Whether the GE response contains `[Source N]` for this source |
| `snippet` | First 400 characters of the source (sentence-clipped) |
| `is_corpus` | `true` if from user's corpus, `false` if synthetic |
| `source_url` | Original URL from corpus metadata (or `null`) |

### 4.6 Score Commentary

After scoring, the system generates a 3-bullet plain-English commentary explaining:

1. Why the article scored the way it did (which rules worked or didn't).
2. Why the AI engine cited or didn't cite the article (what it valued in competitors).
3. The single most impactful change to improve the score further.

---

## 5. Rule Extraction Pipeline (AutoGEO 4-Stage)

Adapted from Wu et al., ICLR 2026. The pipeline analyzes how different documents perform in AI-generated responses and extracts actionable content optimization rules.

### Prerequisites

- A **query set** with at least 5 queries.
- A **corpus set** with at least 5 documents (`MIN_CORPUS_DOCS = 5`).
- An API key for the target GE model.

### Stage 1: Explainer

For each query in the query set:

1. **BM25 retrieval** — Rank corpus documents for the query, take top 5.
2. **GE simulation** — Feed retrieved documents to the target AI engine, get a cited response.
3. **Contrast pair selection** — Identify the highest-visibility and lowest-visibility documents based on word visibility scores in the GE response.
4. **Explanation generation** — LLM analyzes the high/low pair and explains what structural, stylistic, and content differences caused the visibility gap.

### Stage 2: Extractor

For each explanation from Stage 1:

1. LLM extracts structured, actionable rules (e.g., "Include author credentials in the first paragraph").
2. Rules shorter than 10 characters are filtered out.
3. All raw rules are accumulated across all queries.

### Stage 3: Merger

Process raw rules in chunks of 50:

1. LLM deduplicates, resolves conflicts (keeps more specific rule), and consolidates.
2. If multiple chunks exist, merge them hierarchically until one set remains.

### Stage 4: Filter

Final quality gate:

1. LLM removes vague, non-actionable, or low-quality rules.
2. Output: the final filtered rule set (typically 15-30 high-quality rules).

### Progress Streaming

The entire pipeline streams progress via SSE with events like:

```json
{"stage": "bm25_retrieval", "completed": 3, "total": 20}
{"stage": "explainer", "completed": 15, "total": 20}
{"stage": "extractor", "completed": 15, "total": 20}
{"stage": "merger", "completed": 1, "total": 1}
{"stage": "filter", "completed": 1, "total": 1}
```

### Cost Estimates

| Queries | Flash Lite | Flash | Pro |
|---------|-----------|-------|-----|
| 10 | ~$0.15 | ~$0.30 | ~$0.80 |
| 20 | ~$0.30 | ~$0.60 | ~$1.50 |
| 30 | ~$0.50 | ~$1.00 | ~$2.50 |

Extraction takes 3-8 minutes depending on query count and model speed.

---

## 6. Article Rewriting

### Single Rule Set

The rewriter takes the original article and a list of filtered rules, then prompts the LLM to regenerate the article while strictly following the rules. Key constraints embedded in the prompt:

- Preserve all factual information and medical accuracy (YMYL content).
- Maintain E-E-A-T signals (author credentials, citations, dates).
- Target 6th-8th grade reading level.
- Include concise answer summaries at the start of each section.

### Multi-Rule Set Merge

When multiple rule sets are selected, the system first LLM-merges them:

1. Concatenate all rules from all selected sets.
2. LLM deduplicates, resolves conflicts, and produces a single 15-30 rule list.
3. The merged list is used for the actual rewrite.

This enables targeting multiple GE models simultaneously (e.g., rules extracted for Gemini + rules extracted for GPT).

---

## 7. Article Scraping

The scraper uses a 4-strategy fallback chain to handle diverse website layouts:

1. **Semantic tags** — Extracts from `<article>`, `<main>`, `[role="main"]` elements.
2. **Body-level semantic** — Falls back to `<section>`, `<p>`, `<h1>`-`<h6>` in `<body>`.
3. **Div-based leaf nodes** — Traverses `<div>` elements with significant text content (handles CMS/Wix/Webflow layouts).
4. **Plain text dump** — Extracts all visible text from `<body>` as last resort.

Each strategy filters out noise elements (nav, footer, sidebar, cookie banners, etc.) and requires a minimum of 80 words. If all strategies yield fewer than 20 words, the scrape fails with a descriptive error.

URL normalization: if the input URL lacks a protocol, `https://` is automatically prepended.

---

## 8. Deprecation Detection

Rule sets and corpus sets display a **deprecated** badge when their upstream dependencies are deleted:

- A **corpus set** is deprecated if its linked `query_set_id` references a QuerySet that no longer exists.
- A **rule set** is deprecated if any `corpus_set_ids` or `query_set_id` in its `extraction_metadata_json` references a missing record.

Deprecation is computed at list-query time — no extra database columns are needed.

---

## 9. Supported GE Models

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

## 10. Dependencies

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
| `lucide-react` | Icon library |

---

## 11. Security

| Concern | Mitigation |
|---------|-----------|
| API key exposure | Keys stored in `backend/.env` only; git-ignored; masked in all API responses; `.env` written with `chmod 600` |
| Frontend key access | Frontend never stores or receives raw API keys; the backend proxies all LLM calls |
| Database | SQLite file is local-only and git-ignored (`backend/data/careyaya_geo.db`) |
| Secrets in git | `.env`, `*.db`, `.claude/` all in `.gitignore`; `.env.example` contains only empty placeholders |
| Network | Designed for localhost only; no authentication layer; do not expose to public internet without adding auth |
| Scraping | User-Agent header mimics standard browser; `httpx` follows redirects with 30s timeout |

---

## 12. References

### Academic Papers

1. **AutoGEO** — Wu, J., Zhong, Z., Kim, S., Xiong, C. *"What Generative Search Engines Like and How to Optimize Web Content Cooperatively."* International Conference on Learning Representations (ICLR), 2026.
   - Core framework for this project: 4-stage rule extraction pipeline (Explainer → Extractor → Merger → Filter), article rewriting methodology, and GEO visibility metrics (V_word, V_pos, V_overall).
   - GitHub: https://github.com/cxcscmu/AutoGEO (MIT License)

2. **GEO** — Aggarwal, P., Murahari, V., Rajpurohit, T., Kalyan, A., Narasimhan, K., Deshpande, A. *"GEO: Generative Engine Optimization."* arXiv:2311.09735, 2023.
   - Introduced the concept of Generative Engine Optimization and the GEO-Bench evaluation dataset with foundational visibility metrics that AutoGEO builds upon.

### Open-Source Projects

| Project | License | Usage |
|---------|---------|-------|
| [AutoGEO](https://github.com/cxcscmu/AutoGEO) | MIT | Vendored in `backend/autogeo/` — adapted for async, progress callbacks, editable prompts |
| [rank-bm25](https://github.com/dorianbrown/rank_bm25) | Apache 2.0 | BM25 Okapi document ranking in retrieval and evaluation |
| [sse-starlette](https://github.com/sysid/sse-starlette) | BSD | SSE streaming for rule extraction progress |
| [ddgs](https://github.com/deedy5/duckduckgo_search) | MIT | Web search for corpus document discovery |
| [FastAPI](https://github.com/tiangolo/fastapi) | MIT | Backend web framework |
| [Vite](https://github.com/vitejs/vite) | MIT | Frontend build tool and dev server |
