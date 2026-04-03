# GEO Assistant

A local web application that helps content teams optimize articles for visibility in AI-powered search engines (ChatGPT, Gemini, Perplexity) using the **AutoGEO** framework (Wu et al., ICLR 2026).

Instead of guessing what makes content rank well in generative engine responses, GEO Assistant extracts empirical optimization rules from real AI engine behavior, applies them to rewrite articles, and then evaluates the improvement with a simulated RAG pipeline — producing before/after visibility scores.

## Features

| Feature | Description |
|---------|-------------|
| **Writing Assistant** | Paste or scrape an article, select rule sets, and receive an AI-optimized rewrite with before/after GEO visibility scores |
| **Rules & Corpus** | Build query sets, collect corpus documents, extract GEO rule sets via the AutoGEO 4-stage pipeline, and manage all resources |
| **Settings** | Configure API keys for OpenAI, Gemini, and Anthropic; set default model |

## Quick Start

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

Open `http://localhost:5173`. Go to **Settings** first to verify your API keys are loaded.

## Environment Variables

Create `backend/.env` from `backend/.env.example`. This file is `.gitignore`-d and must **never** be committed.

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | For GPT models | OpenAI API key (`sk-proj-...`) |
| `GOOGLE_API_KEY` | For Gemini models | Google AI Studio key (`AIza...`) |
| `ANTHROPIC_API_KEY` | For Claude models | Anthropic key (`sk-ant-...`) |
| `DEFAULT_MODEL` | No | Default GE model ID (default: `gemini-2.5-flash-lite`) |
| `DEFAULT_RULE_SET` | No | Default rule set ID to pre-select |

At least **one** API key must be set. The cheapest option for most operations is `gemini-2.5-flash-lite`.

## Workflow Example

The typical end-to-end workflow for optimizing an article:

### Step 1: Create a Query Set

Navigate to **Rules & Corpus** > **Query Sets**. Choose one of two input modes:

- **Topic mode** — Enter a topic like `"dementia caregiving"` and the system generates 20 search queries that users might ask an AI engine.
- **Article mode** — Paste article text or scrape a URL. The LLM analyzes the content and generates queries relevant to that specific article.

Review, edit, and save the query set (e.g., `"Dementia Care v1"`).

### Step 2: Build a Corpus

Under **Rules & Corpus** > **Corpus**, build a collection of competing documents:

- **Discover from Query Set** — Uses DuckDuckGo to find real web pages matching your queries, then scrape and add them in bulk.
- **Add URL** — Scrape a single page.
- **Add Text** — Paste content directly.

Aim for 10+ documents to avoid falling back to synthetic competitors during evaluation.

### Step 3: Extract a Rule Set

Under **Rules & Corpus** > **Rule Sets**, click **Extract New Rule Set**:

1. Select a query set, a corpus set, and a target GE model (e.g., Gemini 2.5 Flash).
2. The system runs the AutoGEO 4-stage pipeline (Explainer, Extractor, Merger, Filter) with live SSE progress streaming.
3. After 3-8 minutes, the filtered rule set is saved (typically 15-30 rules).

You can extract separate rule sets for different GE models and merge them at rewrite time.

### Step 4: Optimize an Article

On the **Writing Assistant** tab:

1. Paste your article or scrape a URL.
2. Select one or more rule sets. If you select multiple, the system LLM-merges their rules before rewriting.
3. Click **Optimize Article** — the system rewrites the article following the selected rules while preserving factual accuracy.
4. Review the side-by-side diff of original vs. optimized text.

### Step 5: Evaluate GEO Scores

After optimization, run a GEO evaluation:

- **Single Query** — Evaluates against one auto-generated or custom test query.
- **Batch Queries** — Randomly samples N queries from the query set and evaluates each independently, then averages results across all queries and engine models.

The evaluation simulates a RAG generative engine: it assembles your article plus competing corpus documents, BM25-ranks them, feeds them to the AI engine, and measures how much of the response cites your article. You get before/after scores for all four visibility metrics described below.

## How GEO Evaluation Works

### The Simulation

GEO evaluation reproduces the methodology from the AutoGEO paper (Wu et al., ICLR 2026). For each test query, the system:

1. **Assembles a document pool** — Your article is placed alongside competing documents. If your corpus has 10+ documents, real corpus entries are used (ranked by BM25 relevance). Otherwise, the system generates synthetic competitors via LLM across 5 quality tiers (authoritative medical reference, community support, nonprofit, clinical summary, advocacy).

2. **BM25-ranks the pool** — All documents (your article + competitors) are ranked for the test query using BM25 Okapi, a standard probabilistic information retrieval function. This determines the order in which sources are presented to the AI engine.

3. **Simulates a generative engine** — The ranked documents are formatted as numbered `[Source N]` blocks and fed to an LLM with a RAG-style prompt: *"Answer this question using only the provided sources. Cite as [Source N]."* This is run **twice** — once with the original article, once with the optimized version — to produce before/after comparisons.

4. **Scores both responses** — The system measures how much of each GE response draws from your article using the four metrics below.

### Visibility Metrics

All metrics are from AutoGEO (Wu et al., ICLR 2026, Equation 1).

| Metric | Formula | What It Measures |
|--------|---------|------------------|
| **Word Visibility** (`V_word`) | `\|words(article) ∩ words(response)\| / \|words(article)\|` | What fraction of your article's unique vocabulary appears anywhere in the AI response. If more of your words show up, the engine is drawing more heavily from your content. Range: 0-100%. |
| **Position Visibility** (`V_pos`) | `Σ (1 / position(w)) / \|words(article)\|` for each matched word `w` | Like Word Visibility, but weights matches by how **early** they appear in the response. A word at position 1 contributes 1.0; at position 100, only 0.01. An article cited in the opening sentence scores higher than one mentioned only in a closing remark. Always ≤ V_word. Range: 0-100%. |
| **Overall Visibility** (`V_overall`) | `(V_word + V_pos) / 2` | Simple average of the two visibility scores. The primary headline metric. |
| **GEU** (Generative Engine Utilization) | `citations_to_your_article / total_citations × 100` | What share of explicit `[Source N]` citations in the response point to your article. Even if the AI uses your words, GEU tells you whether it formally attributes them to your source. Range: 0-100%. |

**Improvement** is calculated as relative percentage change: `((after - before) / before) × 100`.

### Limitations: Simulation vs. Real-World GE Behavior

The GEO evaluation is a **controlled simulation**, not a measurement of live search engine behavior. The scores are meaningful for comparing before/after optimization quality, but they should not be interpreted as predictions of actual ranking in ChatGPT, Gemini, or Perplexity. Key differences:

- **Corpus gap.** Real generative engines retrieve from billions of indexed web pages. This simulation retrieves from your local corpus (typically 10-200 documents). A high score here means your article outperforms the competitors *you provided*, not the entire internet. The quality and diversity of your corpus directly affects score reliability — a weak corpus yields inflated scores.

- **Model gap.** The LLM simulating the generative engine is the same commercial API model (e.g., Gemini 2.5 Flash) but accessed through a different pathway than how Google Search or ChatGPT actually uses it internally. Production search engines use proprietary retrieval pipelines, custom fine-tuning, internal ranking signals, and safety filters that are not replicated here. The same base model may behave differently when embedded in a production search stack.

- **Prompt gap.** The RAG simulation uses a generic prompt: *"Answer using only the provided sources, cite as [Source N]."* Real generative engines use sophisticated, undisclosed prompt chains that include grounding instructions, recency signals, authority heuristics, and user personalization. The citation behavior you see here is an approximation.

- **Retrieval gap.** BM25 is a term-frequency baseline. Production systems use dense vector retrieval, hybrid search, learned re-rankers, and freshness/authority signals that BM25 cannot capture. Documents that rank well under BM25 may rank differently in a real retrieval pipeline.

- **Temporal gap.** AI engine behavior changes frequently as providers update their models and retrieval systems. Rules extracted today may become less effective as engines evolve.

**Bottom line:** Use GEO scores to measure *relative improvement* from optimization — the delta between original and optimized versions under controlled conditions. Treat absolute scores as directional indicators, not guarantees.

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

- API keys are stored in `backend/.env` only — never sent to or stored in the frontend.
- `.env` is git-ignored; `backend/.env.example` is the safe-to-commit template.
- The `.env` file is written with owner-only permissions (`chmod 600`).
- API keys are masked in all Settings API responses.
- The SQLite database (`backend/data/careyaya_geo.db`) is local-only and git-ignored.
- Designed for local use only — no authentication layer is included.

## Architecture

See [PRODUCTION.md](PRODUCTION.md) for the full technical specification including API endpoints, database schema, evaluation metrics, and pipeline details.

## References

### Papers

- Wu, Zhong, Kim, Xiong. **"AutoGEO: Automated Generative Engine Optimization."** *ICLR 2026.* — Core framework: 4-stage rule extraction pipeline, article rewriting methodology, and GEO visibility metrics (Word Inclusion, Position-Adjusted, Overall).
- Aggarwal et al. **"GEO: Generative Engine Optimization."** *arXiv:2311.09735, 2023.* — Introduced the concept of Generative Engine Optimization and the GEO-Bench evaluation dataset with baseline visibility metrics.

### Open-Source Projects

| Project | License | Role |
|---------|---------|------|
| [AutoGEO](https://github.com/cxcscmu/AutoGEO) | MIT | Vendored and adapted — prompt templates, pipeline structure, rewriting methodology |
| [rank-bm25](https://github.com/dorianbrown/rank_bm25) | Apache 2.0 | BM25 Okapi document ranking for corpus retrieval |
| [sse-starlette](https://github.com/sysid/sse-starlette) | BSD | Server-Sent Events for rule extraction progress streaming |
| [ddgs](https://github.com/deedy5/duckduckgo_search) | MIT | DuckDuckGo web search for corpus document discovery |

## License

This project uses vendored code from [AutoGEO](https://github.com/cxcscmu/AutoGEO) (MIT License). See `backend/autogeo/` for adapted source files and `backend/autogeo/prompts/` for editable prompt templates.
