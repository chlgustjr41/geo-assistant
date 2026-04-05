"""
Full RAG GEO evaluation pipeline implementing AutoGEO visibility metrics.

AutoGEO metrics (Wu et al., ICLR 2026):
  V_word(d, R) = |words(d) ∩ words(R)| / |words(d)|
  V_pos(d, R)  = Σ_{w ∈ words(d) ∩ words(R)} (1 / pos(w, R)) / |words(d)|
  V_overall    = (V_word + V_pos) / 2

where R is the GE response text, d is the target document, and pos(w, R) is the
1-indexed first occurrence of word w in R.

Evaluation flow:
  1. Generate synthetic competing documents via LLM
  2. BM25-rank corpus [target_doc + competitors] for the test query
  3. Simulate GE RAG response for both original and rewritten versions
  4. Compute visibility scores and improvement percentages
"""
from __future__ import annotations
import re
import asyncio
from dataclasses import dataclass, field
from typing import Callable

from . import llm_client
from .llm_client import get_pipeline_model
from .document_retriever import generate_synthetic_competitors, bm25_retrieve

_DEFAULT_NUM_COMPETING = 4
_DEFAULT_QUERY = "caregiving tips and support for families"

_GE_RAG_PROMPT = (
    "Answer the following question using only the provided sources. "
    "When you use information from a source, cite it as [Source N].\n\n"
    "Question: {query}\n\n"
    "{sources}\n\n"
    "Provide a comprehensive, accurate answer."
)


@dataclass
class GeoScores:
    word: float
    pos: float
    overall: float


@dataclass
class SourceCitation:
    source_id: int
    label: str
    word_score: float
    cited: bool
    snippet: str = ""


@dataclass
class GeoEvalResult:
    original_scores: GeoScores
    optimized_scores: GeoScores
    improvement: dict
    ge_response_original: str
    ge_response_optimized: str
    source_citations: list[SourceCitation] = field(default_factory=list)
    test_query_used: str = ""
    evaluation_cost_usd: float = 0.0
    score_commentary: str = ""


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z]+", text.lower())


def _word_visibility(doc_text: str, ge_response: str) -> float:
    """AutoGEO Eq. 1 — fraction of unique doc words appearing in GE response."""
    doc_words = set(_tokenize(doc_text))
    if not doc_words:
        return 0.0
    response_words = set(_tokenize(ge_response))
    return len(doc_words & response_words) / len(doc_words)


def _position_visibility(doc_text: str, ge_response: str) -> float:
    """AutoGEO Eq. 2 — position-weighted visibility (1/rank for first occurrence)."""
    doc_words = set(_tokenize(doc_text))
    if not doc_words:
        return 0.0

    response_tokens = _tokenize(ge_response)
    first_pos: dict[str, int] = {}
    for i, w in enumerate(response_tokens):
        if w not in first_pos:
            first_pos[w] = i + 1  # 1-indexed

    score = sum(1.0 / first_pos[w] for w in doc_words if w in first_pos)
    return score / len(doc_words)


def _format_sources(retrieved: list[tuple[int, str]]) -> str:
    return "\n\n".join(f"[Source {i + 1}]\n{doc}" for i, (_, doc) in enumerate(retrieved))


async def _simulate_ge(
    query: str,
    retrieved: list[tuple[int, str]],
    engine_model: str | None = None,
) -> str:
    """Simulate GE response using the specified engine_model."""
    if engine_model is None:
        engine_model = get_pipeline_model()
    sources_text = _format_sources(retrieved)
    prompt = _GE_RAG_PROMPT.format(query=query, sources=sources_text)
    return await llm_client.chat(engine_model, prompt, max_tokens=1024)


async def _generate_score_commentary(
    query: str,
    original_scores: dict,
    optimized_scores: dict,
    rules_applied: list[str],
    source_citations: list[dict],
) -> str:
    """Generate a plain-English explanation of why the article received its GEO scores."""
    rules_text = "\n".join(f"- {r}" for r in rules_applied[:20]) if rules_applied else "No specific rules provided."
    cited = [c for c in source_citations if c["cited"]]
    uncited = [c for c in source_citations if not c["cited"]]
    cited_list = ", ".join(f"{c['label']} (score {c['word_score']:.1f})" for c in cited) or "none"
    uncited_list = ", ".join(c["label"] for c in uncited) or "none"

    prompt = f"""You are a GEO (Generative Engine Optimization) expert helping a healthcare content writer understand their article's AI visibility scores.

Test Query: "{query}"

Visibility Scores:
  Before optimization — Word: {original_scores['word']:.1f}%, Position: {original_scores['pos']:.1f}%, Overall: {original_scores['overall']:.1f}%
  After optimization  — Word: {optimized_scores['word']:.1f}%, Position: {optimized_scores['pos']:.1f}%, Overall: {optimized_scores['overall']:.1f}%

Rules applied to optimize the article:
{rules_text}

Sources the AI engine cited: {cited_list}
Sources the AI engine did NOT cite: {uncited_list}

Write exactly 3 bullet points (use "• " prefix) for a non-technical healthcare writer:
• Bullet 1: Why the article scored this way — specifically which rules from the list above appear to have worked and which may not have been fully applied
• Bullet 2: Why the AI engine cited or didn't cite the article — what the engine valued in the competing documents
• Bullet 3: The single most impactful change the writer can make to improve the score further

Be direct, plain, and actionable. No technical jargon. Keep each bullet to 1-2 sentences."""

    try:
        return await llm_client.chat(get_pipeline_model(), prompt, max_tokens=1024)
    except Exception:
        return ""


def _pct_change(before: float, after: float) -> float:
    if before == 0.0:
        return 100.0 if after > 0 else 0.0
    return ((after - before) / before) * 100.0


async def generate_test_query(article_content: str) -> str:
    """Generate a short generic test query from article content via LLM."""
    prompt = (
        "Read this article and write ONE short search query (5–10 words) "
        "that someone might type to find this article in a search engine.\n"
        "Requirements: generic enough to also match competing articles on the same topic, "
        "specific enough to be relevant to the article's main subject.\n"
        "Output ONLY the query text, nothing else.\n\n"
        f"Article (first 2000 chars):\n{article_content[:2000]}"
    )
    try:
        result = await llm_client.chat(get_pipeline_model(), prompt, max_tokens=200)
        return result.strip().strip('"').strip("'")
    except Exception:
        return _DEFAULT_QUERY


async def _eval_single_model(
    original_content: str,
    rewritten_content: str,
    retrieved_orig: list[tuple[int, str]],
    retrieved_opt: list[tuple[int, str]],
    query: str,
    rules_applied: list[str] | None = None,
    competitors_from_corpus: bool = False,
    engine_model: str | None = None,
    generate_commentary: bool = True,
    doc_metadata: list[dict | None] | None = None,
) -> dict:
    """Run GE simulation using the given engine_model and return a serialisable result dict."""
    if engine_model is None:
        engine_model = get_pipeline_model()
    try:
        ge_orig, ge_opt = await asyncio.gather(
            _simulate_ge(query, retrieved_orig, engine_model),
            _simulate_ge(query, retrieved_opt, engine_model),
        )
    except Exception as e:
        return {"engine_model": engine_model, "error": str(e)}

    orig_word = _word_visibility(original_content, ge_orig)
    orig_pos = _position_visibility(original_content, ge_orig)
    orig_overall = (orig_word + orig_pos) / 2.0

    opt_word = _word_visibility(rewritten_content, ge_opt)
    opt_pos = _position_visibility(rewritten_content, ge_opt)
    opt_overall = (opt_word + opt_pos) / 2.0

    source_citations: list[dict] = []
    for slot_idx, (corpus_idx, doc) in enumerate(retrieved_opt, 1):
        if corpus_idx == 0:
            label = "Your Article"
            is_corpus = False
        elif competitors_from_corpus:
            label = f"Corpus Doc {corpus_idx}"
            is_corpus = True
        else:
            label = f"Synthetic Competitor {corpus_idx}"
            is_corpus = False
        ws = _word_visibility(doc, ge_opt)
        cited = bool(re.search(rf"\[Source {slot_idx}\]", ge_opt))
        # Trim snippet to first 400 chars, ending at a sentence boundary if possible
        trimmed = doc[:400]
        last_period = trimmed.rfind('. ')
        snippet = trimmed[:last_period + 1] if last_period > 100 else trimmed
        meta = (doc_metadata[corpus_idx] if doc_metadata and corpus_idx < len(doc_metadata) else None)
        source_url = meta.get("source_url") if meta else None
        source_citations.append({
            "source_id": slot_idx,
            "label": label,
            "word_score": ws * 100.0,
            "cited": cited,
            "snippet": snippet,
            "is_corpus": is_corpus,
            "source_url": source_url,
        })

    # GEU: fraction of total source citations that reference the target article (slot 1)
    def _geu(ge_response: str, article_slot: int) -> float:
        all_cites = re.findall(r'\[Source \d+\]', ge_response)
        if not all_cites:
            return 0.0
        article_cites = re.findall(rf'\[Source {article_slot}\]', ge_response)
        return (len(article_cites) / len(all_cites)) * 100.0

    orig_geu = _geu(ge_orig, 1)
    opt_geu = _geu(ge_opt, 1)

    orig_scores = {"word": orig_word * 100.0, "pos": orig_pos * 100.0, "overall": orig_overall * 100.0, "geu": orig_geu}
    opt_scores = {"word": opt_word * 100.0, "pos": opt_pos * 100.0, "overall": opt_overall * 100.0, "geu": opt_geu}

    commentary = await _generate_score_commentary(
        query, orig_scores, opt_scores, rules_applied or [], source_citations
    ) if generate_commentary else ""

    return {
        "engine_model": engine_model,
        "original_scores": orig_scores,
        "optimized_scores": opt_scores,
        "improvement": {
            "word_pct": _pct_change(orig_word, opt_word),
            "pos_pct": _pct_change(orig_pos, opt_pos),
            "overall_pct": _pct_change(orig_overall, opt_overall),
            "geu_pct": _pct_change(orig_geu / 100.0, opt_geu / 100.0),
        },
        "ge_response_original": ge_orig,
        "ge_response_optimized": ge_opt,
        "source_citations": source_citations,
        "test_query_used": query,
        "evaluation_cost_usd": 0.0,  # filled by caller
        "score_commentary": commentary,
    }


_CORPUS_MIN_DOCS = 10  # minimum corpus docs to skip synthetic fallback


def _combine_results(results: list[dict], query: str) -> dict:
    """Average per-model results into a single combined result."""
    valid = [r for r in results if "error" not in r]
    if not valid:
        return results[0]

    def avg(sub: str, key: str) -> float:
        return sum(r[sub][key] for r in valid) / len(valid)

    orig_word = avg("original_scores", "word")
    orig_pos = avg("original_scores", "pos")
    orig_overall = avg("original_scores", "overall")
    orig_geu = avg("original_scores", "geu")
    opt_word = avg("optimized_scores", "word")
    opt_pos = avg("optimized_scores", "pos")
    opt_overall = avg("optimized_scores", "overall")
    opt_geu = avg("optimized_scores", "geu")

    return {
        "engine_model": "combined",
        "original_scores": {"word": orig_word, "pos": orig_pos, "overall": orig_overall, "geu": orig_geu},
        "optimized_scores": {"word": opt_word, "pos": opt_pos, "overall": opt_overall, "geu": opt_geu},
        "improvement": {
            "word_pct": _pct_change(orig_word / 100.0, opt_word / 100.0),
            "pos_pct": _pct_change(orig_pos / 100.0, opt_pos / 100.0),
            "overall_pct": _pct_change(orig_overall / 100.0, opt_overall / 100.0),
            "geu_pct": _pct_change(orig_geu / 100.0, opt_geu / 100.0),
        },
        "ge_response_original": valid[0]["ge_response_original"],
        "ge_response_optimized": valid[0]["ge_response_optimized"],
        "source_citations": valid[0]["source_citations"],
        "test_query_used": query,
        "evaluation_cost_usd": round(sum(r.get("evaluation_cost_usd", 0) for r in valid), 4),
        "score_commentary": "",
    }


def _aggregate_batch_results(batch_query_results: list[dict], unique_models: list[str]) -> list[dict]:
    """Average per-model scores across all batch query results for the top-level summary."""
    agg = []
    for model in unique_models:
        model_results = [
            r
            for bqr in batch_query_results
            for r in bqr["results"]
            if r.get("engine_model") == model and "error" not in r
        ]
        if not model_results:
            continue

        def avg_scores(sub: str, key: str) -> float:
            return sum(r[sub][key] for r in model_results) / len(model_results)

        rep = model_results[0]
        orig_w = avg_scores("original_scores", "word")
        orig_p = avg_scores("original_scores", "pos")
        orig_o = avg_scores("original_scores", "overall")
        orig_g = avg_scores("original_scores", "geu")
        opt_w = avg_scores("optimized_scores", "word")
        opt_p = avg_scores("optimized_scores", "pos")
        opt_o = avg_scores("optimized_scores", "overall")
        opt_g = avg_scores("optimized_scores", "geu")

        agg.append({
            "engine_model": model,
            "original_scores": {"word": orig_w, "pos": orig_p, "overall": orig_o, "geu": orig_g},
            "optimized_scores": {"word": opt_w, "pos": opt_p, "overall": opt_o, "geu": opt_g},
            "improvement": {
                "word_pct": _pct_change(orig_w / 100.0, opt_w / 100.0),
                "pos_pct": _pct_change(orig_p / 100.0, opt_p / 100.0),
                "overall_pct": _pct_change(orig_o / 100.0, opt_o / 100.0),
                "geu_pct": _pct_change(orig_g / 100.0, opt_g / 100.0),
            },
            "ge_response_original": rep["ge_response_original"],
            "ge_response_optimized": rep["ge_response_optimized"],
            "source_citations": rep["source_citations"],
            "test_query_used": rep["test_query_used"],
            "evaluation_cost_usd": round(sum(r.get("evaluation_cost_usd", 0) for r in model_results), 4),
            "score_commentary": "",
        })
    return agg


async def evaluate_geo_multi(
    original_content: str,
    rewritten_content: str,
    test_query: str | None = None,
    num_competing_docs: int = _DEFAULT_NUM_COMPETING,
    rules_applied: list[str] | None = None,
    corpus_docs: list[str] | None = None,
    corpus_doc_metadata: list[dict] | None = None,
    engine_models: list[str] | None = None,
    queries: list[str] | None = None,
    on_progress: "Callable[[int, int, str | None], None] | None" = None,
) -> dict:
    """Run GEO evaluation against each unique GE engine model from the selected rule sets.

    Each unique engine_model gets its own RAG simulation so scores reflect how that
    specific AI engine would rank the article.  A combined (averaged) result is also
    returned when more than one model is evaluated.

    If corpus_docs has >= CORPUS_MIN_DOCS entries they are used as competitors;
    otherwise synthetic competitors are generated as fallback.

    When queries is provided, batch mode is used: each query is evaluated individually
    and results are aggregated. When queries is None, single query mode is used.
    """
    using_corpus = corpus_docs and len(corpus_docs) >= _CORPUS_MIN_DOCS
    if using_corpus:
        competing_docs = corpus_docs[:20]  # cap at 20 for speed
        # Build per-doc metadata list: index 0 = target article (None), 1..n = competing docs
        doc_metadata: list[dict | None] = [None] + (
            corpus_doc_metadata[:len(competing_docs)] if corpus_doc_metadata else [None] * len(competing_docs)
        )
    else:
        # For synthetic competitors we need a representative query — use test_query or
        # first batch query or fall back to the default
        seed_query = test_query or (queries[0] if queries else None) or _DEFAULT_QUERY
        competing_docs = await generate_synthetic_competitors(seed_query, num_competing_docs, get_pipeline_model())
        doc_metadata = None  # synthetic docs have no URL metadata

    corpus_orig = [original_content] + competing_docs
    corpus_opt = [rewritten_content] + competing_docs
    k = min(5, len(corpus_orig))

    # Deduplicate engine models while preserving order; fall back to pipeline model
    unique_models: list[str] = list(dict.fromkeys(engine_models)) if engine_models else [get_pipeline_model()]

    if queries:
        # ── Batch mode: evaluate each query individually ──────────────────────
        # Flatten all (query × model) tasks into one gather for maximum parallelism
        # Always force-include index 0 (the user's article) so the GE always sees it
        tasks = []
        task_keys: list[tuple[str, str]] = []
        for q in queries:
            ro = bm25_retrieve(q, corpus_orig, k, force_include=[0])
            ropt = bm25_retrieve(q, corpus_opt, k, force_include=[0])
            for m in unique_models:
                tasks.append(_eval_single_model(
                    original_content, rewritten_content,
                    ro, ropt, q,
                    rules_applied=rules_applied,
                    competitors_from_corpus=bool(using_corpus),
                    engine_model=m,
                    generate_commentary=False,
                    doc_metadata=doc_metadata,
                ))
                task_keys.append((q, m))

        flat = list(await asyncio.gather(*tasks))

        # Reassemble by query
        from collections import defaultdict
        qmap: dict[str, list[dict]] = defaultdict(list)
        for (q, _m), r in zip(task_keys, flat):
            qmap[q].append(r)

        if on_progress:
            on_progress(len(queries), len(queries), None)

        batch_query_results: list[dict] = []
        for q in queries:
            qr = qmap[q]
            combined_q = _combine_results(qr, q) if len(qr) > 1 else None
            batch_query_results.append({"query": q, "results": qr, "combined": combined_q})

        agg_results = _aggregate_batch_results(batch_query_results, unique_models)
        agg_combined = _combine_results(agg_results, queries[0]) if len(agg_results) > 1 else None

        per_eval_cost = 2 * 0.002
        competitor_cost = 0.0 if using_corpus else num_competing_docs * 0.002
        total_cost = competitor_cost + per_eval_cost * len(unique_models) * len(queries)

        return {
            "results": agg_results,
            "combined": agg_combined,
            "test_query_used": queries[0],
            "total_cost_usd": round(total_cost, 4),
            "corpus_used": bool(using_corpus),
            "corpus_doc_count": len(corpus_docs) if corpus_docs else 0,
            "is_batch": True,
            "batch_query_results": batch_query_results,
        }

    else:
        # ── Single query mode ─────────────────────────────────────────────────
        if on_progress:
            on_progress(0, 1, None)
        query = test_query or await generate_test_query(original_content)

        retrieved_orig = bm25_retrieve(query, corpus_orig, k, force_include=[0])
        retrieved_opt = bm25_retrieve(query, corpus_opt, k, force_include=[0])

        results = list(await asyncio.gather(*[
            _eval_single_model(
                original_content, rewritten_content,
                retrieved_orig, retrieved_opt,
                query,
                rules_applied=rules_applied,
                competitors_from_corpus=bool(using_corpus),
                engine_model=model,
                doc_metadata=doc_metadata,
            )
            for model in unique_models
        ]))

        per_eval_cost = 2 * 0.002
        competitor_cost = 0.0 if using_corpus else num_competing_docs * 0.002
        total_cost = competitor_cost + per_eval_cost * len(unique_models)
        for r in results:
            if "error" not in r:
                r["evaluation_cost_usd"] = round(per_eval_cost, 4)

        if on_progress:
            on_progress(1, 1, query)

        combined = _combine_results(results, query) if len(results) > 1 else None

        return {
            "results": results,
            "combined": combined,
            "test_query_used": query,
            "total_cost_usd": round(total_cost, 4),
            "corpus_used": bool(using_corpus),
            "corpus_doc_count": len(corpus_docs) if corpus_docs else 0,
            "is_batch": False,
        }


async def evaluate_geo(
    original_content: str,
    rewritten_content: str,
    engine_model: str,
    test_query: str | None = None,
    num_competing_docs: int = _DEFAULT_NUM_COMPETING,
) -> GeoEvalResult:
    """Run full GEO evaluation and return visibility scores for both versions."""
    query = test_query or _DEFAULT_QUERY

    # Use pipeline base model (Claude Sonnet) for competitor generation
    competing_docs = await generate_synthetic_competitors(query, num_competing_docs, get_pipeline_model())

    # Build corpora: target doc first, then competitors
    corpus_orig = [original_content] + competing_docs
    corpus_opt = [rewritten_content] + competing_docs

    k = min(5, len(corpus_orig))
    retrieved_orig = bm25_retrieve(query, corpus_orig, k)
    retrieved_opt = bm25_retrieve(query, corpus_opt, k)

    # Simulate GE responses in parallel
    ge_orig, ge_opt = await asyncio.gather(
        _simulate_ge(query, retrieved_orig, engine_model),
        _simulate_ge(query, retrieved_opt, engine_model),
    )

    # Score target doc (corpus index 0) in each run
    orig_word = _word_visibility(original_content, ge_orig)
    orig_pos = _position_visibility(original_content, ge_orig)
    orig_overall = (orig_word + orig_pos) / 2.0

    opt_word = _word_visibility(rewritten_content, ge_opt)
    opt_pos = _position_visibility(rewritten_content, ge_opt)
    opt_overall = (opt_word + opt_pos) / 2.0

    # Source citations for the optimized run
    source_citations: list[SourceCitation] = []
    for slot_idx, (corpus_idx, doc) in enumerate(retrieved_opt, 1):
        label = "Your Article" if corpus_idx == 0 else f"Competitor {corpus_idx}"
        ws = _word_visibility(doc, ge_opt)
        cited = bool(re.search(rf"\[Source {slot_idx}\]", ge_opt))
        source_citations.append(
            SourceCitation(source_id=slot_idx, label=label, word_score=ws * 100.0, cited=cited)
        )

    # Rough cost estimate: 2 GE calls + num_competing_docs generation calls
    # Gemini Flash Lite ~$0.001/1K tokens; assume ~2K tokens per call on average
    est_cost = (2 + num_competing_docs) * 0.002

    return GeoEvalResult(
        original_scores=GeoScores(
            word=orig_word * 100.0,
            pos=orig_pos * 100.0,
            overall=orig_overall * 100.0,
        ),
        optimized_scores=GeoScores(
            word=opt_word * 100.0,
            pos=opt_pos * 100.0,
            overall=opt_overall * 100.0,
        ),
        improvement={
            "word_pct": _pct_change(orig_word, opt_word),
            "pos_pct": _pct_change(orig_pos, opt_pos),
            "overall_pct": _pct_change(orig_overall, opt_overall),
        },
        ge_response_original=ge_orig,
        ge_response_optimized=ge_opt,
        source_citations=source_citations,
        test_query_used=query,
        evaluation_cost_usd=est_cost,
    )
