"""
AutoGEO 4-stage rule extraction pipeline.
Stages: Explainer -> Extractor -> Merger -> Filter

Adapted from Wu et al. ICLR 2026 (AutoGEO).

Paper design: BM25 retrieves top-K real documents from ClueWeb22 per query.
This implementation uses the user's built corpus as the ClueWeb22 substitute —
real web articles scraped via Build Corpus, retrieved by BM25 per query.
Corpus must be built before extraction (same corpus is reused in GEO evaluation).
"""
from __future__ import annotations
import asyncio
from pathlib import Path
from typing import Callable
from rank_bm25 import BM25Okapi
from . import llm_client
from .llm_client import get_pipeline_model

PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "autogeo" / "prompts"
MIN_CORPUS_DOCS = 5
RETRIEVAL_TOP_K = 5


def _load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.txt").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# BM25 retrieval — paper Section 3.1
# ---------------------------------------------------------------------------

def bm25_retrieve(query: str, corpus_docs: list[str], top_k: int = RETRIEVAL_TOP_K) -> list[str]:
    """BM25-retrieve top_k corpus documents for a query (paper's ClueWeb22 retrieval step)."""
    tokenized = [doc.lower().split() for doc in corpus_docs]
    bm25 = BM25Okapi(tokenized)
    scores = bm25.get_scores(query.lower().split())
    top_indices = sorted(range(len(corpus_docs)), key=lambda i: scores[i], reverse=True)[:top_k]
    return [corpus_docs[i] for i in top_indices]


# ---------------------------------------------------------------------------
# GE simulation — paper Section 3.2
# ---------------------------------------------------------------------------

async def _simulate_ge(query: str, docs: list[str], model: str) -> str:
    """Simulate a generative engine response citing retrieved sources."""
    sources_text = "\n\n".join(
        f"[Source {i+1}]: {doc[:1500]}" for i, doc in enumerate(docs)
    )
    prompt = f"""You are a healthcare search AI assistant. A user searched for:
"{query}"

Here are the top relevant sources retrieved for this query:

{sources_text}

Generate a comprehensive, well-cited answer using these sources.
When using information from a source, cite it as [Source N].
Synthesize information across sources where appropriate."""
    return await llm_client.chat(model, prompt, max_tokens=1024)


# ---------------------------------------------------------------------------
# Visibility scoring & contrast pair selection — paper Equations 1–2
# ---------------------------------------------------------------------------

def _word_visibility(doc_idx: int, ge_response: str) -> float:
    source_tag = f"[Source {doc_idx + 1}]"
    sentences = ge_response.split(". ")
    total_words = len(ge_response.split())
    if total_words == 0:
        return 0.0
    cited_words = sum(len(s.split()) for s in sentences if source_tag in s)
    return (cited_words / total_words) * 100


def _select_contrast_pair(docs: list[str], ge_response: str) -> tuple[str, str]:
    """Select highest-contrast (best vs worst visibility) pair — paper Equation 2."""
    scores = [_word_visibility(i, ge_response) for i in range(len(docs))]
    best_idx = max(range(len(scores)), key=lambda i: scores[i])
    worst_idx = min(range(len(scores)), key=lambda i: scores[i])
    return docs[best_idx], docs[worst_idx]


# ---------------------------------------------------------------------------
# 4-Stage Pipeline — paper Section 3.3
# ---------------------------------------------------------------------------

async def _stage_explainer(
    pairs: list[tuple[str, str, str]],
    progress_cb: Callable[[str, int, int], None],
) -> list[str]:
    explainer_prompt = _load_prompt("explainer")
    explanations = []
    for i, (query, high_doc, low_doc) in enumerate(pairs):
        progress_cb("explainer", i + 1, len(pairs))
        prompt = f"""{explainer_prompt}

Search Query: "{query}"

HIGH-VISIBILITY DOCUMENT:
{high_doc[:2000]}

LOW-VISIBILITY DOCUMENT:
{low_doc[:2000]}"""
        explanation = await llm_client.chat(get_pipeline_model(), prompt, max_tokens=2048)
        explanations.append(explanation)
    return explanations


async def _stage_extractor(
    explanations: list[str],
    progress_cb: Callable[[str, int, int], None],
) -> list[str]:
    extractor_prompt = _load_prompt("extractor")
    all_rules = []
    for i, explanation in enumerate(explanations):
        progress_cb("extractor", i + 1, len(explanations))
        prompt = f"""{extractor_prompt}

OBSERVATIONS:
{explanation}"""
        raw_rules = await llm_client.chat(get_pipeline_model(), prompt, max_tokens=1024)
        for line in raw_rules.split("\n"):
            line = line.strip().lstrip("0123456789.). ").strip()
            if line and len(line) > 10:
                all_rules.append(line)
    return all_rules


async def _stage_merger(
    rules: list[str],
    progress_cb: Callable[[str, int, int], None],
    chunk_size: int = 50,
) -> list[str]:
    merger_prompt = _load_prompt("merger")
    chunks = [rules[i:i + chunk_size] for i in range(0, len(rules), chunk_size)]
    merged_chunks = []

    for i, chunk in enumerate(chunks):
        progress_cb("merger", i + 1, len(chunks))
        numbered = "\n".join(f"{j+1}. {r}" for j, r in enumerate(chunk))
        prompt = f"""{merger_prompt}

CANDIDATE RULES:
{numbered}"""
        merged = await llm_client.chat(get_pipeline_model(), prompt, max_tokens=2048)
        for line in merged.split("\n"):
            line = line.strip().lstrip("0123456789.). ").strip()
            if line and len(line) > 10:
                merged_chunks.append(line)

    if len(chunks) > 1:
        progress_cb("merger", len(chunks), len(chunks))
        numbered = "\n".join(f"{j+1}. {r}" for j, r in enumerate(merged_chunks))
        prompt = f"""{merger_prompt}

CANDIDATE RULES:
{numbered}"""
        final = await llm_client.chat(get_pipeline_model(), prompt, max_tokens=1024)
        result = []
        for line in final.split("\n"):
            line = line.strip().lstrip("0123456789.). ").strip()
            if line and len(line) > 10:
                result.append(line)
        return result

    return merged_chunks


async def _stage_filter(
    rules: list[str],
    progress_cb: Callable[[str, int, int], None],
) -> list[str]:
    filter_prompt = _load_prompt("filter")
    progress_cb("filter", 1, 1)
    numbered = "\n".join(f"{i+1}. {r}" for i, r in enumerate(rules))
    prompt = f"""{filter_prompt}

RULES TO FILTER:
{numbered}"""
    filtered = await llm_client.chat(get_pipeline_model(), prompt, max_tokens=2048)
    result = []
    for line in filtered.split("\n"):
        line = line.strip().lstrip("0123456789.). ").strip()
        if line and len(line) > 10:
            result.append(line)
    return result


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def extract_rules_stream(
    queries: list[str],
    engine_model: str,
    rule_set_name: str,
    progress_callback: Callable[[dict], None],
    corpus_docs: list[str],
) -> tuple[list[str], list[dict]]:
    """
    Run the full AutoGEO rule extraction pipeline.

    corpus_docs: real document texts (user's local ClueWeb22 substitute).
                 Requires >= MIN_CORPUS_DOCS entries.
    engine_model: GE model to simulate (only used in _simulate_ge;
                  all 4 pipeline stages use get_pipeline_model()).
    Returns (filtered_rules, ge_responses_log).
    """
    if len(corpus_docs) < MIN_CORPUS_DOCS:
        raise ValueError(
            f"Corpus has only {len(corpus_docs)} document(s). "
            f"At least {MIN_CORPUS_DOCS} are required. "
            "Add more documents in the Build Corpus tab."
        )

    def _cb(stage: str, completed: int, total: int) -> None:
        progress_callback({"stage": stage, "completed": completed, "total": total})

    # Phase A — BM25 retrieval + GE simulation + contrast pair selection
    pairs: list[tuple[str, str, str]] = []
    ge_responses_log: list[dict] = []

    for i, query in enumerate(queries):
        progress_callback({"stage": "bm25_retrieval", "completed": i + 1, "total": len(queries)})
        retrieved = bm25_retrieve(query, corpus_docs, top_k=RETRIEVAL_TOP_K)
        ge_response = await _simulate_ge(query, retrieved, engine_model)
        ge_responses_log.append({"query": query, "response": ge_response})
        high_doc, low_doc = _select_contrast_pair(retrieved, ge_response)
        pairs.append((query, high_doc, low_doc))

    # Phase B — 4-stage pipeline
    explanations = await _stage_explainer(pairs, _cb)
    raw_rules = await _stage_extractor(explanations, _cb)
    merged_rules = await _stage_merger(raw_rules, _cb)
    filtered_rules = await _stage_filter(merged_rules, _cb)

    return filtered_rules, ge_responses_log
