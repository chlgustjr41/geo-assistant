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

from . import llm_client
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
    engine_model: str,
) -> str:
    sources_text = _format_sources(retrieved)
    prompt = _GE_RAG_PROMPT.format(query=query, sources=sources_text)
    return await llm_client.chat(engine_model, prompt, max_tokens=1024)


def _pct_change(before: float, after: float) -> float:
    if before == 0.0:
        return 100.0 if after > 0 else 0.0
    return ((after - before) / before) * 100.0


async def evaluate_geo(
    original_content: str,
    rewritten_content: str,
    engine_model: str,
    test_query: str | None = None,
    num_competing_docs: int = _DEFAULT_NUM_COMPETING,
) -> GeoEvalResult:
    """Run full GEO evaluation and return visibility scores for both versions."""
    query = test_query or _DEFAULT_QUERY

    # Use cheapest model for competitor generation to minimize cost
    cheap_model = llm_client.CHEAPEST_MODEL
    competing_docs = await generate_synthetic_competitors(query, num_competing_docs, cheap_model)

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
