# CareYaya GEO Assistant — Production Specification

> **For Claude Code.** This document fully specifies a web application that helps non-technical CareYaya staff optimize blog/article content for visibility in AI-powered search engines using the AutoGEO framework (ICLR 2026). Every essential feature described here must be completed and demo-ready.

---

## 1. Project Summary

### What This App Does

A tabbed local web application with three features:

1. **GEO Writing Assistant** (hero feature) — Rewrites articles using pre-extracted generative engine preference rules. Users select a GE model (Gemini/GPT/Claude), a rule set, and optionally inject trending keywords. Shows side-by-side original vs. optimized text. Runs a **full RAG-based GEO evaluation** (the same methodology from the ICLR 2026 paper) to produce real Word, Position, and Overall visibility scores proving the improvement.

2. **Trend Discovery** — Surfaces trending healthcare/caregiving search topics via Google Trends. Users browse trend charts and keyword lists, select relevant trends, and send them as context to the Writing Assistant.

3. **Rule Extraction & Training Config** — Extracts GE preference rules from any topic domain using AutoGEO's 4-stage pipeline (Explainer → Extractor → Merger → Filter). Also provides a training configuration UI for AutoGEOMini that exports datasets and config files for offline GPU-based reinforcement learning training.

### Key Constraints

- **Non-technical users:** Everything is UI-driven. No CLI, no config files.
- **Cost separation:** Rule extraction (expensive, one-time) is fully separated from the Writing Assistant (cheap, per-use). Rules are extracted once, reused indefinitely.
- **Flexible target:** CareYaya is the default website but the URL is configurable for competitor analysis.
- **Local dev:** Runs on localhost with cloud API calls to OpenAI/Gemini/Claude. No deployment required.
- **Demo-ready:** Every tab must be fully functional with polished UI for a live presentation.

### Research Foundation

| Paper | Venue | Role in App |
|-------|-------|-------------|
| **AutoGEO** — "What Generative Search Engines Like and How to Optimize Web Content Cooperatively" (Wu, Zhong, Kim, Xiong) | ICLR 2026 | Core framework: rule extraction, rewriting, GEO scoring |
| **GEO** — Generative Engine Optimization (Aggarwal et al.) | KDD 2024 | GEO-Bench dataset, baseline optimization strategies, visibility metrics |
| **C-SEO Bench** — Does Conversational SEO Work? (Puerto et al.) | NeurIPS 2025 | Validates that traditional SEO fundamentals dominate; GEO is secondary enhancer |
| **LiSA** — LLM-Guided Semantic-Aware Clustering (Liu et al.) | ACL 2025 | Topic clustering methodology for trend analysis |

GitHub: https://github.com/cxcscmu/AutoGEO — MIT License, Python, 50 stars

---

## 2. Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18+, TypeScript, Vite, TailwindCSS, Recharts |
| Backend | Python 3.11+, FastAPI, Uvicorn, async httpx |
| Database | SQLite via SQLAlchemy (zero-config, portable) |
| LLM APIs | OpenAI (`gpt-4o-mini`, `gpt-4o`), Google Gemini (`gemini-2.5-flash-lite`, `gemini-2.5-flash`), Anthropic Claude (`claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022`) |
| Trends | trendspyg (MIT, active pytrends replacement) |
| Scraping | BeautifulSoup4 + httpx (async) |
| Retrieval | rank-bm25 for document ranking in GEO evaluation |

### Project Structure

```
careyaya-geo-assistant/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.tsx                    # App shell, tab navigation
│   │   │   ├── WritingAssistant/
│   │   │   │   ├── WritingAssistant.tsx      # Main view
│   │   │   │   ├── ArticleInput.tsx          # URL scrape or paste text
│   │   │   │   ├── ConfigPanel.tsx           # Model + rule set + trend selectors
│   │   │   │   ├── SideBySideView.tsx        # Original vs rewritten
│   │   │   │   ├── GEOScorePanel.tsx         # RAG evaluation results display
│   │   │   │   └── RewriteHistory.tsx        # Saved past rewrites
│   │   │   ├── TrendDiscovery/
│   │   │   │   ├── TrendDiscovery.tsx        # Main view
│   │   │   │   ├── TopicInput.tsx            # Seed topic input
│   │   │   │   ├── TrendChart.tsx            # Time series (recharts)
│   │   │   │   ├── KeywordList.tsx           # Selectable keyword results
│   │   │   │   └── TrendSelector.tsx         # Send selected → Writing Assistant
│   │   │   ├── RuleTraining/
│   │   │   │   ├── RuleTraining.tsx          # Main view with two sub-sections
│   │   │   │   ├── RuleExtractor.tsx         # Topic input → run extraction → view rules
│   │   │   │   ├── RuleSetManager.tsx        # List, view, edit, delete rule sets
│   │   │   │   ├── MiniTrainingConfig.tsx    # AutoGEOMini export config UI
│   │   │   │   └── ExportPanel.tsx           # Download training data + config
│   │   │   ├── Settings/
│   │   │   │   └── Settings.tsx              # API keys, target website URL, defaults
│   │   │   └── shared/
│   │   │       ├── LoadingSpinner.tsx
│   │   │       ├── Toast.tsx
│   │   │       └── MarkdownPreview.tsx
│   │   ├── hooks/
│   │   │   ├── useWritingAssistant.ts
│   │   │   ├── useTrends.ts
│   │   │   ├── useRuleExtraction.ts
│   │   │   └── useSettings.ts
│   │   ├── services/
│   │   │   └── api.ts                        # Typed API client
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── backend/
│   ├── app/
│   │   ├── main.py                           # FastAPI app, CORS, mount routers
│   │   ├── config.py                         # Env/settings management
│   │   ├── database.py                       # SQLite + SQLAlchemy setup
│   │   ├── models.py                         # ORM models
│   │   ├── routers/
│   │   │   ├── writing.py                    # /api/writing/*
│   │   │   ├── trends.py                     # /api/trends/*
│   │   │   ├── rules.py                      # /api/rules/*
│   │   │   └── settings.py                   # /api/settings/*
│   │   └── services/
│   │       ├── llm_client.py                 # Unified async LLM client (OpenAI/Gemini/Claude)
│   │       ├── geo_rewriter.py               # Article rewriting with AutoGEO rules
│   │       ├── geo_evaluator.py              # Full RAG GEO scoring pipeline
│   │       ├── trend_service.py              # Google Trends via trendspyg
│   │       ├── rule_extractor.py             # AutoGEO 4-stage rule extraction
│   │       ├── article_scraper.py            # URL → extracted article text
│   │       ├── query_generator.py            # Topic → synthetic queries (for rule extraction)
│   │       └── document_retriever.py         # BM25 retrieval for GEO evaluation
│   ├── autogeo/                              # Vendored from github.com/cxcscmu/AutoGEO
│   │   ├── __init__.py
│   │   ├── rewriters.py
│   │   ├── extract_rules.py
│   │   ├── evaluate.py
│   │   └── prompts/
│   │       ├── explainer.txt
│   │       ├── extractor.txt
│   │       ├── merger.txt
│   │       ├── filter.txt
│   │       └── rewriter.txt
│   ├── data/
│   │   ├── rule_sets/                        # Pre-built JSON rule sets
│   │   │   ├── gemini_healthcare.json
│   │   │   ├── gpt_healthcare.json
│   │   │   └── claude_healthcare.json
│   │   ├── seed_queries/
│   │   │   └── caregiving_seeds.json
│   │   └── careyaya_geo.db                   # SQLite file
│   ├── requirements.txt
│   ├── .env.example
│   └── run.py
│
├── PRODUCTION.md
├── README.md
└── .gitignore
```

### Communication Flow

```
[React Frontend]  <-->  [FastAPI Backend]  <-->  [LLM APIs (OpenAI/Gemini/Claude)]
                            |                         |
                      [SQLite DB]              [Google Trends API]
                  (rules, articles,            (trendspyg library)
                   scores, history)
```

---

## 3. Tab 1: GEO Writing Assistant (Hero Feature)

This is the primary demo feature. It must be polished, responsive, and produce visibly impressive results.

### UI Layout

```
+--------------------------------------------------------------+
|  [Writing Assistant]  [Trends]  [Rules & Training]  [Settings]|
+--------------------------------------------------------------+
|                                                              |
|  +- Article Input ----------------------------------------+ |
|  | [Paste article text]  or  [Enter URL to scrape]        | |
|  +---------------------------------------------------------+ |
|                                                              |
|  +- Configuration ----------------------------------------+ |
|  | GE Model:   [Gemini 2.5 Flash Lite v]                 | |
|  | Rule Set:   [Healthcare General v1 v]   [View Rules]   | |
|  | Trend Keywords: caregiver burnout, respite care  [x]   | |
|  |                 (injected from Trend Discovery tab)     | |
|  +---------------------------------------------------------+ |
|                                                              |
|  [Optimize Article]                                          |
|                                                              |
|  +- Side-by-Side -----------------------------------------+ |
|  |  ORIGINAL               |  GEO-OPTIMIZED              | |
|  |  (scrollable text)      |  (scrollable text)          | |
|  +---------------------------------------------------------+ |
|                                                              |
|  [Run GEO Evaluation]                                        |
|                                                              |
|  +- GEO Score Results ------------------------------------+ |
|  |  Test Query: "how to find home care for elderly parent" | |
|  |                                                         | |
|  |  +-------------+  +-------------+  +-------------+     | |
|  |  |   Word      |  |  Position   |  |  Overall    |     | |
|  |  |  18.1->33.5 |  |  18.3->33.8 |  |  18.3->34.1|     | |
|  |  |  +85.1%     |  |  +84.7%     |  |  +86.3%    |     | |
|  |  +-------------+  +-------------+  +-------------+     | |
|  |                                                         | |
|  |  GE Response Preview:                                   | |
|  |  "According to [Source 2], finding home care involves.." | |
|  |  (your article highlighted in green if cited)           | |
|  +---------------------------------------------------------+ |
|                                                              |
|  [Copy Optimized]  [Save to History]                         |
+--------------------------------------------------------------+
```

### Endpoints

**`POST /api/writing/scrape-url`**
```json
// Request
{ "url": "https://careyaya.org/blog/some-article" }
// Response
{
  "title": "Article Title",
  "content": "Extracted article body text...",
  "meta_description": "...",
  "word_count": 1250
}
```

**`POST /api/writing/rewrite`**
```json
// Request
{
  "content": "article text",
  "model": "gemini-2.5-flash-lite",
  "rule_set_id": "healthcare-general-v1",
  "trend_keywords": ["caregiver burnout", "respite care"]
}
// Response
{
  "original_content": "...",
  "rewritten_content": "...",
  "model_used": "gemini-2.5-flash-lite",
  "rules_applied": ["Include specific statistics...", "Start each section with..."],
  "trend_keywords_injected": ["caregiver burnout", "respite care"]
}
```

**`POST /api/writing/evaluate-geo`**

This is the Full RAG GEO evaluation — the same pipeline from the AutoGEO paper.

```json
// Request
{
  "original_content": "...",
  "rewritten_content": "...",
  "test_query": "how to find home care for elderly parent",
  "engine_model": "gemini-2.5-flash-lite",
  "num_competing_docs": 4
}
// Response
{
  "original_scores": { "word": 18.08, "pos": 18.27, "overall": 18.32 },
  "optimized_scores": { "word": 33.52, "pos": 33.80, "overall": 34.05 },
  "improvement": { "word_pct": 85.1, "pos_pct": 84.7, "overall_pct": 86.3 },
  "ge_response_original": "Based on the sources, home care...",
  "ge_response_optimized": "According to [Source 2], finding home care involves...",
  "source_citations": [
    { "source_id": 1, "label": "Competitor A", "word_score": 12.3, "cited": true },
    { "source_id": 2, "label": "Your Article (optimized)", "word_score": 33.5, "cited": true },
    { "source_id": 3, "label": "Competitor B", "word_score": 8.1, "cited": false }
  ],
  "test_query_used": "how to find home care for elderly parent",
  "evaluation_cost_usd": 0.08
}
```

### Implementation: `geo_rewriter.py`

```python
"""
Wraps AutoGEO's rewrite_document with trend keyword injection.

Prompt structure (adapted from AutoGEO paper Section 3.2.1):

    Here is the source:
    <article content>

    You are given a website article as a source. Your task is to
    regenerate the provided source so that it strictly adheres to
    the "Quality Guidelines" below while preserving all factual
    information accurately.

    ## Quality Guidelines to Follow:
    <loaded rule set - filtered_rules from JSON>

    ## Trending Topic Context (integrate naturally where relevant):
    <trend keywords selected from Tab 2, if any>

    ## Healthcare Domain Constraints:
    - This is YMYL healthcare/caregiving content
    - Preserve all medical accuracy - never fabricate statistics
    - Maintain E-E-A-T signals (author credentials, citations, dates)
    - Target 6th-8th grade reading level
    - Include concise answer summaries at the start of each section

    Output only the rewritten article text. No explanations.

Implementation:
1. Load rule set JSON from DB or data/rule_sets/
2. Build prompt with rules + optional trend keywords
3. Call selected LLM via llm_client.py
4. Return original + rewritten content
"""
```

### Implementation: `geo_evaluator.py`

This is the core GEO scoring engine. Implements the Full RAG simulation from AutoGEO (Equation 1, Section 4).

```python
"""
Full RAG-based GEO evaluation pipeline.
Reproduces the exact evaluation methodology from the AutoGEO paper
(Wu et al., ICLR 2026), adapted for single-article evaluation.

STEP 1: QUERY GENERATION
  If no test_query provided, auto-generate one relevant healthcare query
  from the article content using the cheapest available LLM:
    "Given this healthcare article, generate one realistic search query
     that a user might ask that this article should answer."

STEP 2: DOCUMENT RETRIEVAL (Competing Sources)
  Build a document set of 5 sources where the target article competes:
  - Slot for the target article (original OR optimized version)
  - 4 competing documents, sourced by priority:
    a) Other scraped CareYaya articles (if available in DB) ranked by BM25
    b) LLM-generated synthetic competitor documents on the same topic:
       "Write a brief 300-word healthcare article answering: {test_query}.
        Write from the perspective of a different healthcare website."
  - Shuffle source order to avoid position bias

STEP 3: GENERATIVE ENGINE SIMULATION
  Simulate a RAG-style generative engine (mirrors Google AI Overview):

    Prompt to the selected LLM:
    ---
    You are a healthcare search AI assistant. A user searched for:
    "{test_query}"

    Here are the top relevant sources retrieved for this query:

    [Source 1]: {document_1_content[:2000]}
    [Source 2]: {document_2_content[:2000]}
    [Source 3]: {document_3_content[:2000]}
    [Source 4]: {document_4_content[:2000]}
    [Source 5]: {document_5_content[:2000]}

    Generate a comprehensive, well-cited answer using these sources.
    When using information from a source, cite it as [Source N].
    Synthesize information across sources where appropriate.
    ---

STEP 4: VISIBILITY SCORING (AutoGEO Equation 1)
  For each source document d and the GE response a, calculate:

  Word(d, a):
    - Find all sentences in 'a' that cite source d (contain [Source N])
    - Count total words in those cited sentences
    - Normalize by total words in the response
    - Score = (cited_words / total_response_words) * 100

  Pos(d, a):
    - For each cited sentence, compute position weight:
      weight = 1 - (sentence_position / total_sentences)
    - Score = sum(weights * sentence_word_counts) / total_response_words * 100

  Overall(d, a):
    - Combined: (Word + Pos) / 2

  Run this for BOTH the original and optimized article to get before/after.
  This means TWO separate GE response generations with different document sets.

STEP 5: RESPONSE ASSEMBLY
  Return scores, both GE response texts, and per-source citation breakdown
  so the frontend can highlight which sources were cited and by how much.

COST:
  Each evaluation = 2 GE response generations (original + optimized)
  + potentially 4 synthetic competitor generations + 1 query generation
  Approx $0.05-0.15 depending on model. Display cost estimate to user.
"""
```

### Implementation: `document_retriever.py`

```python
"""
Provides competing documents for GEO evaluation.

Strategy (priority order):
1. Check DB for other scraped CareYaya articles. Use BM25 to rank
   by relevance to the test query. Select top 4.
2. If fewer than 4 articles in DB, generate synthetic competitors:
   Call cheapest LLM: "Write a 300-word healthcare article answering:
   {query}. Be informative and cite general statistics."
3. Cache generated competitors in DB (CompetitorDoc table) for reuse.

Uses rank-bm25 library:
  from rank_bm25 import BM25Okapi
  tokenized = [doc.split() for doc in documents]
  bm25 = BM25Okapi(tokenized)
  scores = bm25.get_scores(query.split())
"""
```

### GE Model Options

```typescript
export const GE_MODELS = [
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "google", tier: "fast" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", tier: "standard" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai", tier: "fast" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai", tier: "standard" },
  { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", provider: "anthropic", tier: "fast" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", provider: "anthropic", tier: "standard" },
] as const;
```

---

## 4. Tab 2: Trend Discovery

### UI Layout

```
+--------------------------------------------------------------+
|  [Writing Assistant]  [Trends]  [Rules & Training]  [Settings]|
+--------------------------------------------------------------+
|                                                              |
|  +- Topic Input ------------------------------------------+ |
|  | Healthcare topic:  [elderly caregiving       ]         | |
|  | Time range: [Past 12 months v]   Region: [US v]       | |
|  | [Discover Trends]                                      | |
|  +---------------------------------------------------------+ |
|                                                              |
|  +- Interest Over Time (recharts line chart) -------------+ |
|  | Multi-line chart showing search interest over time      | |
|  +---------------------------------------------------------+ |
|                                                              |
|  +- Rising Keywords -------------------------------------+ |
|  | [x] caregiver burnout symptoms     (Breakout)          | |
|  | [x] respite care near me           (+250%)             | |
|  | [ ] home health aide salary 2026   (+120%)             | |
|  | [ ] dementia caregiver support     (+95%)              | |
|  | [ ] elderly fall prevention tips   (+45%)              | |
|  +---------------------------------------------------------+ |
|                                                              |
|  [Send Selected to Writing Assistant]                        |
+--------------------------------------------------------------+
```

### Endpoint

**`POST /api/trends/discover`**
```json
// Request
{ "topic": "elderly caregiving", "timeframe": "today 12-m", "geo": "US" }
// Response
{
  "interest_over_time": [
    { "date": "2025-04", "elderly caregiving": 72, "caregiver burnout": 45 }
  ],
  "rising_queries": [
    { "query": "caregiver burnout symptoms", "value": "Breakout" },
    { "query": "respite care near me", "value": 250 }
  ],
  "top_queries": [
    { "query": "home care services", "value": 100 }
  ]
}
```

### Implementation: `trend_service.py`

```python
"""
Uses trendspyg library (MIT, pip install trendspyg).
Active replacement for deprecated pytrends (archived April 2025).

Key operations:
  - interest_over_time(keyword, timeframe, geo)
  - related_queries(keyword) -> rising + top queries
  - related_topics(keyword)

Google Trends healthcare category ID = 45.

Cache all results in SQLite (TrendCache table) with 24-hour TTL
to avoid rate limiting. Check cache before every API call.

The "Send to Writing Assistant" action stores selected keywords
in frontend state that Tab 1's ConfigPanel reads from.
"""
```

---

## 5. Tab 3: Rule Extraction & Training Config

Two sections: **Rule Extraction** (fully functional) and **AutoGEOMini Training** (config + export).

### Section A: Rule Extraction

Users describe a topic conversationally. System generates synthetic queries, runs AutoGEO's 4-stage pipeline, produces a reusable rule set.

#### Workflow

**Step 1: Topic Input**
User types: `"caregiving tips for families with Alzheimer's patients"`

**Step 2: Synthetic Query Generation**
System generates 15-30 queries via LLM. User can review, edit, add, remove.

**Step 3: Rule Extraction** (AutoGEO pipeline)
For each query:
1. Generate 5 synthetic document variants of varying quality
2. Feed query + documents to selected GE model, get response
3. Score each document's visibility (AutoGEO Eq. 1)
4. Select highest-contrast document pair (AutoGEO Eq. 2)

Then run the 4-stage pipeline on all pairs:
- **Explainer:** Compare pairs, explain visibility differences
- **Extractor:** Distill into concise insights
- **Merger:** Hierarchically merge into candidate rules
- **Filter:** Remove ambiguous rules

**Step 4: Review & Save**
User views extracted rules, can edit, rename, save.

#### Endpoints

**`POST /api/rules/generate-queries`**
```json
{ "topic": "caregiving tips for Alzheimer's patients", "num_queries": 20 }
```

**`POST /api/rules/extract`** (long-running, SSE for progress)
```json
{
  "queries": ["q1", "q2"],
  "engine_model": "gemini-2.5-flash-lite",
  "rule_set_name": "Alzheimers-Gemini-v1"
}
// SSE stream:
// data: {"stage": "explainer", "completed": 5, "total": 20}
// data: {"stage": "merger", "completed": 1, "total": 1}
// data: {"status": "complete", "rule_set_id": "rs_abc123", "num_rules": 12}
```

**`GET /api/rules`** — List all rule sets
**`GET /api/rules/{id}`** — Get rule set with rules
**`PUT /api/rules/{id}`** — Update rules or name
**`DELETE /api/rules/{id}`** — Delete (prevent deleting built-ins)
**`GET /api/rules/{id}/export`** — Download as JSON

#### Implementation: `rule_extractor.py`

```python
"""
Wraps AutoGEO's 4-stage pipeline for web app use.

Key adaptation: Since we don't have ClueWeb22 locally, we GENERATE
synthetic documents for each query using the LLM:

  For each query, generate 5 documents of varying quality:
  - Doc 1: Comprehensive, well-cited, statistics-rich
  - Doc 2: Moderate quality, some citations
  - Doc 3: Generic, thin content
  - Doc 4: Off-topic or tangential
  - Doc 5: Keyword-stuffed but low substance

This creates natural visibility contrast for the Explainer stage.

Progress callbacks at each stage for SSE streaming.
Hierarchical Merger chunks insights into groups of 50.

Cost: ~$0.30-0.80 per extraction run of 20 queries.
Display estimate to user before starting.
"""
```

### Section B: AutoGEOMini Training Config

UI for configuring and exporting training data for offline GPU training.

#### UI Fields

```
+- AutoGEOMini Training Config -----------------------------+
|                                                            |
| Info: AutoGEOMini requires 2x A100 GPUs.                  |
|       Training: ~4h (SFT) + ~48h (GRPO).                  |
|                                                            |
| Base Model:      [Qwen3-1.7B v]                           |
| Teacher Model:   [Gemini 2.5 Pro v]  (for cold start)     |
| Rule Set:        [Alzheimers-Gemini-v1 v]                  |
|                                                            |
| Cold Start: LR [2e-5] Epochs [3] Batch [4]                |
| GRPO: Group Size [4] Clip Epsilon [0.2] KL Beta [0.04]    |
|                                                            |
| [Export Training Package]                                  |
|                                                            |
| Exports ZIP containing:                                    |
|   finetune.json, rule_set.json,                            |
|   config_cold_start.yaml, config_grpo.yaml,                |
|   README_training.md                                       |
+------------------------------------------------------------+
```

#### Export Endpoint

**`POST /api/rules/export-training-package`**
```json
{
  "rule_set_id": "rs_abc123",
  "base_model": "Qwen/Qwen3-1.7B",
  "teacher_model": "gemini-2.5-pro",
  "cold_start_config": { "lr": 2e-5, "epochs": 3, "batch_size": 4 },
  "grpo_config": { "group_size": 4, "clip_epsilon": 0.2, "kl_beta": 0.04 }
}
// Response: ZIP file download
```

---

## 6. Settings Tab

```
+- API Keys ------------------------------------------------+
| OpenAI:    [sk-**************]  [Test OK]  [Save]         |
| Gemini:    [AI***************]  [Test OK]  [Save]         |
| Anthropic: [sk-ant-**********]  [Test --]  [Save]         |
+------------------------------------------------------------+
| Target Website: [https://careyaya.org        ]             |
+------------------------------------------------------------+
| Defaults:                                                  |
|   GE Model:  [Gemini 2.5 Flash Lite v]                    |
|   Rule Set:  [Healthcare General v1 v]                     |
+------------------------------------------------------------+
```

API keys stored in `.env` on server. Never sent to frontend.

**`GET /api/settings`** — Masked key statuses + defaults
**`POST /api/settings/api-keys`** — Update `.env`
**`POST /api/settings/test-key`** — Test specific key
**`PUT /api/settings/defaults`** — Update default model/rule set

---

## 7. Data Models

```python
class RuleSet(Base):
    __tablename__ = "rule_sets"
    id: str                    # UUID
    name: str
    engine_model: str          # e.g., "gemini-2.5-flash-lite"
    topic_domain: str          # e.g., "alzheimers-caregiving"
    rules_json: str            # JSON with "filtered_rules" key
    num_rules: int
    is_builtin: bool           # True for shipped defaults
    created_at: datetime

class Article(Base):
    __tablename__ = "articles"
    id: str
    source_url: str | None
    title: str
    original_content: str
    rewritten_content: str | None
    geo_scores_json: str | None
    rule_set_id: str
    model_used: str
    trend_keywords_json: str | None
    created_at: datetime

class CompetitorDoc(Base):
    __tablename__ = "competitor_docs"
    id: str
    query: str
    content: str
    source: str                # "scraped" | "synthetic"
    created_at: datetime

class TrendCache(Base):
    __tablename__ = "trend_cache"
    id: str
    query: str
    timeframe: str
    geo: str
    result_json: str
    cached_at: datetime
    ttl_hours: int = 24
```

---

## 8. Pre-Built Default Data

Ship these so the app works immediately without rule extraction.

### Default Healthcare Rule Sets

`backend/data/rule_sets/gemini_healthcare.json` (create similar for GPT and Claude):
```json
{
  "name": "Healthcare General v1 (Gemini)",
  "engine_model": "gemini-2.5-flash-lite",
  "filtered_rules": [
    "Include specific statistics from authoritative healthcare sources (CDC, NIH, AARP, peer-reviewed journals) with inline citations.",
    "Start each major section with a concise 1-2 sentence answer that directly addresses a potential user question.",
    "Use question-style headings that match how users phrase queries to AI assistants (e.g., 'How much does home care cost?' not 'Cost Overview').",
    "Provide concrete, actionable caregiving steps with specific details (timeframes, costs, contact information) rather than generic advice.",
    "Include personal experience signals (first-person caregiving perspectives, 'in our experience at CareYaya') to satisfy E-E-A-T requirements.",
    "Structure content for scannability: short paragraphs (3-4 sentences), key takeaways after each section, comparison tables where applicable.",
    "Address the emotional dimension of caregiving alongside practical information - generative engines favor comprehensive, empathetic coverage.",
    "Include an FAQ section with 5-8 common questions and concise answers - these map directly to conversational AI queries.",
    "Reference current programs, laws, and resources by name (e.g., 'Medicare Part A home health benefit', 'FMLA caregiver provisions').",
    "Write at a 6th-8th grade reading level while maintaining clinical accuracy - use plain language explanations for medical terms."
  ]
}
```

### Seed Query Templates

`backend/data/seed_queries/caregiving_seeds.json`:
```json
{
  "templates": [
    "how to find {care_type} for {family_member}",
    "cost of {care_type} in {location}",
    "{condition} caregiving tips for beginners",
    "signs that {family_member} needs {care_type}",
    "how to prevent caregiver burnout",
    "best {care_type} agencies {location}",
    "{condition} daily care routine checklist",
    "government programs for {care_type} assistance"
  ],
  "variables": {
    "care_type": ["home care", "memory care", "respite care", "hospice care", "assisted living"],
    "family_member": ["elderly parent", "spouse with dementia", "aging grandparent"],
    "condition": ["Alzheimer's", "Parkinson's", "stroke recovery", "dementia"],
    "location": ["near me", "in my area"]
  }
}
```

---

## 9. Implementation Priority

All phases must be completed. Order ensures demo flow works end-to-end as early as possible.

### Phase 1: Foundation
- [ ] Monorepo: Vite React frontend + FastAPI backend
- [ ] SQLite database with all models
- [ ] `llm_client.py` — unified async client for OpenAI/Gemini/Claude
- [ ] `article_scraper.py` — URL to clean text
- [ ] Settings tab with API key management
- [ ] Tab navigation shell with TailwindCSS
- [ ] Load pre-built default rule sets into DB on first run

### Phase 2: Writing Assistant Core
- [ ] `geo_rewriter.py` — AutoGEO rule-based rewriting with trend injection
- [ ] Writing Assistant UI: article input, config panel, model/rule selectors
- [ ] Side-by-side original vs. optimized view
- [ ] Copy and save-to-history
- [ ] Wire `POST /api/writing/rewrite` and `/api/writing/scrape-url`

### Phase 3: GEO Evaluation
- [ ] `document_retriever.py` — BM25 + synthetic competitor generation
- [ ] `geo_evaluator.py` — full RAG simulation with Word/Pos/Overall metrics
- [ ] GEO Score Panel UI with before/after metric cards
- [ ] GE response preview with citation highlighting
- [ ] Wire `POST /api/writing/evaluate-geo`
- [ ] Cost estimate display before running

### Phase 4: Trend Discovery
- [ ] `trend_service.py` — trendspyg with caching
- [ ] Trend Discovery UI: topic input, recharts line chart, keyword list
- [ ] Checkboxes + "Send to Writing Assistant" action
- [ ] Wire `POST /api/trends/discover`

### Phase 5: Rule Extraction & Training Config
- [ ] `query_generator.py` — topic to synthetic queries
- [ ] `rule_extractor.py` — AutoGEO 4-stage pipeline with SSE progress
- [ ] Rule Extraction UI: topic input, query review, progress, rule viewer
- [ ] Rule Set Manager: list, view, edit, delete, export
- [ ] AutoGEOMini Training Config UI with export ZIP
- [ ] Wire all `/api/rules/*` endpoints

### Phase 6: Polish
- [ ] Loading states, error handling, toasts on all tabs
- [ ] Empty states for fresh installs
- [ ] Responsive layout for laptop demo
- [ ] End-to-end test: Trends -> Writer -> GEO eval
- [ ] Verify pre-built rule sets load on fresh start

---

## 10. Demo Flow

1. **Open app** — clean tabbed interface, Settings shows API keys configured
2. **Trends tab:** Type "elderly caregiving" — show trending keywords spiking — select "caregiver burnout" — click "Send to Writing Assistant"
3. **Writing Assistant:** Paste CareYaya blog URL — scrape — show original text
4. **Point out config:** Gemini selected, Healthcare rules loaded, trend keyword injected
5. **Click "Optimize Article"** — side-by-side appears with visible improvements
6. **Click "Run GEO Evaluation"** — Full RAG simulation runs (~20s) — Word/Pos/Overall scores reveal major improvement — show GE response with citation highlighting
7. **Rules & Training tab:** Briefly show rule extraction flow and AutoGEOMini export
8. **Key message:** "Built on AutoGEO (CMU, ICLR 2026). Same evaluation pipeline as the paper. Any content team member can use this to measurably improve CareYaya's visibility in AI search."

---

## 11. Environment Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Add: OPENAI_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY
python run.py  # http://localhost:8000
```

**requirements.txt:**
```
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
sqlalchemy>=2.0.0
httpx>=0.27.0
beautifulsoup4>=4.12.0
trendspyg>=0.4.0
rank-bm25>=0.2.2
openai>=1.30.0
anthropic>=0.30.0
google-generativeai>=0.8.0
python-dotenv>=1.0.0
pydantic>=2.0.0
sse-starlette>=2.0.0
aiofiles>=24.0.0
```

### Frontend

```bash
cd frontend
npm install
npm run dev  # http://localhost:5173
```

**vite.config.ts proxy:**
```typescript
export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:8000' } }
})
```

**Key dependencies:**
```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "recharts": "^2.12.0",
    "axios": "^1.7.0",
    "react-markdown": "^9.0.0",
    "lucide-react": "^0.400.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "@types/react": "^18.3.0"
  }
}
```

---

## 12. Vendoring AutoGEO

Clone from https://github.com/cxcscmu/AutoGEO and adapt:

```bash
git clone https://github.com/cxcscmu/AutoGEO /tmp/autogeo-source
cp /tmp/autogeo-source/autogeo/rewriters.py backend/autogeo/
cp /tmp/autogeo-source/autogeo/extract_rules.py backend/autogeo/
cp /tmp/autogeo-source/autogeo/evaluate.py backend/autogeo/
```

**Adaptations:**
1. Replace sync API calls with async (httpx)
2. Add progress callbacks to extract_rules for SSE
3. Add healthcare-specific prompt additions to rewriters.py
4. Extract GEO scoring functions from evaluate.py into geo_evaluator.py
5. Store prompts as editable text files in `backend/autogeo/prompts/`

### Rule Set Format (AutoGEO standard)

```json
{
  "filtered_rules": [
    "Rule 1 text...",
    "Rule 2 text..."
  ]
}
```

---

## 13. Implementation Notes

- **Start with backend.** FastAPI + SQLite + LLM client + one working rewrite endpoint first.
- **Use httpx async throughout.** All LLM calls must be non-blocking.
- **SSE for long tasks.** Rule extraction takes 3-5 min. Use sse-starlette.
- **Error handling is critical.** Invalid keys, rate limits, scrape failures all need clear user-facing messages.
- **GEO evaluation is the hardest piece.** It needs: query generation, competitor docs, two GE simulations, visibility scoring. Get this right and the demo sells itself.
- **TailwindCSS only.** No custom CSS files. Use Tailwind's built-in palette.
- **Pre-built rule sets must auto-load.** On app init, check DB; if empty, seed from `data/rule_sets/*.json`.
- **The `.env` approach means single-user local dev.** This is intentional and correct for scope.
