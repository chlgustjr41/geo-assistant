"""
AutoGEO 4-stage rule extraction pipeline.
Stages: Explainer -> Extractor -> Merger -> Filter

Adapted from Wu et al. ICLR 2026 (AutoGEO).
Uses LLM-generated synthetic documents since ClueWeb22 is unavailable locally.
"""
from __future__ import annotations
import asyncio
import json
import random
from pathlib import Path
from typing import AsyncGenerator, Callable
from . import llm_client

PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "autogeo" / "prompts"

def _load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.txt").read_text(encoding="utf-8")


# -- Synthetic document generation ------------------------------------------

DOC_QUALITY_PROMPTS = [
    # Doc 1: High quality -- comprehensive, statistics-rich
    "Write a comprehensive 400-word healthcare article answering: \"{query}\". Include specific statistics from CDC/NIH/AARP, use question-style subheadings, provide concrete actionable steps, cite named programs and costs. High E-E-A-T signals.",
    # Doc 2: Good -- moderate quality, some citations
    "Write a 300-word informative article answering: \"{query}\". Include a few statistics, use clear structure, provide some practical guidance. Decent but not exceptional quality.",
    # Doc 3: Average -- generic, thin content
    "Write a 200-word generic article about: \"{query}\". Use general advice without specifics. No statistics, vague recommendations, minimal structure.",
    # Doc 4: Off-topic / tangential
    "Write a 200-word article that is loosely related to but doesn't directly answer: \"{query}\". Drift to related topics, provide only tangential information.",
    # Doc 5: Keyword-stuffed -- low substance
    "Write a 200-word article that overuses keywords related to \"{query}\" but provides very little actual useful information. Keyword density is high but content is thin.",
]


async def _generate_doc(query: str, quality_prompt: str, model: str) -> str:
    prompt = quality_prompt.format(query=query)
    return await llm_client.chat(model, prompt, max_tokens=1024)


async def _generate_docs_for_query(query: str, model: str) -> list[str]:
    """Generate 5 synthetic documents of varying quality for a query."""
    tasks = [_generate_doc(query, p, model) for p in DOC_QUALITY_PROMPTS]
    return await asyncio.gather(*tasks)


# -- GE simulation & visibility scoring -------------------------------------

async def _simulate_ge(query: str, docs: list[str], model: str) -> str:
    """Simulate a generative engine response citing [Source N]."""
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


def _word_visibility(doc_idx: int, ge_response: str) -> float:
    """Calculate Word visibility score for source (doc_idx+1) in GE response."""
    source_tag = f"[Source {doc_idx + 1}]"
    sentences = ge_response.split(". ")
    total_words = len(ge_response.split())
    if total_words == 0:
        return 0.0
    cited_words = sum(
        len(s.split()) for s in sentences if source_tag in s
    )
    return (cited_words / total_words) * 100


def _select_contrast_pair(docs: list[str], ge_response: str) -> tuple[str, str]:
    """Select the highest-contrast (best vs worst) visibility pair (AutoGEO Eq. 2)."""
    scores = [_word_visibility(i, ge_response) for i in range(len(docs))]
    best_idx = max(range(len(scores)), key=lambda i: scores[i])
    worst_idx = min(range(len(scores)), key=lambda i: scores[i])
    return docs[best_idx], docs[worst_idx]


# -- 4-Stage Pipeline -------------------------------------------------------

async def _stage_explainer(
    pairs: list[tuple[str, str, str]],  # (query, high_doc, low_doc)
    model: str,
    progress_cb: Callable[[str, int, int], None],
) -> list[str]:
    """Stage 1: For each pair, explain why high_doc outperforms low_doc."""
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
        explanation = await llm_client.chat(model, prompt, max_tokens=512)
        explanations.append(explanation)
    return explanations


async def _stage_extractor(
    explanations: list[str],
    model: str,
    progress_cb: Callable[[str, int, int], None],
) -> list[str]:
    """Stage 2: Distill each explanation into 3-5 concise rules."""
    extractor_prompt = _load_prompt("extractor")
    all_rules = []
    for i, explanation in enumerate(explanations):
        progress_cb("extractor", i + 1, len(explanations))
        prompt = f"""{extractor_prompt}

OBSERVATIONS:
{explanation}"""
        raw_rules = await llm_client.chat(model, prompt, max_tokens=512)
        # Parse numbered list
        for line in raw_rules.split("\n"):
            line = line.strip().lstrip("0123456789.). ").strip()
            if line and len(line) > 10:
                all_rules.append(line)
    return all_rules


async def _stage_merger(
    rules: list[str],
    model: str,
    progress_cb: Callable[[str, int, int], None],
    chunk_size: int = 50,
) -> list[str]:
    """Stage 3: Hierarchically merge rules into non-redundant set."""
    merger_prompt = _load_prompt("merger")

    # Process in chunks of chunk_size
    chunks = [rules[i:i+chunk_size] for i in range(0, len(rules), chunk_size)]
    merged_chunks = []

    for i, chunk in enumerate(chunks):
        progress_cb("merger", i + 1, len(chunks))
        numbered = "\n".join(f"{j+1}. {r}" for j, r in enumerate(chunk))
        prompt = f"""{merger_prompt}

CANDIDATE RULES:
{numbered}"""
        merged = await llm_client.chat(model, prompt, max_tokens=1024)
        for line in merged.split("\n"):
            line = line.strip().lstrip("0123456789.). ").strip()
            if line and len(line) > 10:
                merged_chunks.append(line)

    # If multiple chunks, merge again
    if len(chunks) > 1:
        progress_cb("merger", len(chunks), len(chunks))
        numbered = "\n".join(f"{j+1}. {r}" for j, r in enumerate(merged_chunks))
        prompt = f"""{merger_prompt}

CANDIDATE RULES:
{numbered}"""
        final = await llm_client.chat(model, prompt, max_tokens=1024)
        result = []
        for line in final.split("\n"):
            line = line.strip().lstrip("0123456789.). ").strip()
            if line and len(line) > 10:
                result.append(line)
        return result

    return merged_chunks


async def _stage_filter(
    rules: list[str],
    model: str,
    progress_cb: Callable[[str, int, int], None],
) -> list[str]:
    """Stage 4: Remove ambiguous or non-actionable rules."""
    filter_prompt = _load_prompt("filter")
    progress_cb("filter", 1, 1)
    numbered = "\n".join(f"{i+1}. {r}" for i, r in enumerate(rules))
    prompt = f"""{filter_prompt}

RULES TO FILTER:
{numbered}"""
    filtered = await llm_client.chat(model, prompt, max_tokens=1024)
    result = []
    for line in filtered.split("\n"):
        line = line.strip().lstrip("0123456789.). ").strip()
        if line and len(line) > 10:
            result.append(line)
    return result


# -- Main extraction entry point --------------------------------------------

async def extract_rules_stream(
    queries: list[str],
    engine_model: str,
    rule_set_name: str,
    progress_callback: Callable[[dict], None],
) -> list[str]:
    """
    Run the full 4-stage AutoGEO rule extraction pipeline.

    Calls progress_callback with dicts like:
      {"stage": "generating_docs", "completed": 3, "total": 20}
      {"stage": "explainer", "completed": 5, "total": 20}
      {"stage": "extractor", "completed": 10, "total": 20}
      {"stage": "merger", "completed": 1, "total": 2}
      {"stage": "filter", "completed": 1, "total": 1}

    Returns the final filtered_rules list.
    """
    # Phase A: Generate synthetic documents + GE responses for each query
    pairs: list[tuple[str, str, str]] = []

    for i, query in enumerate(queries):
        progress_callback({"stage": "generating_docs", "completed": i + 1, "total": len(queries)})
        docs = await _generate_docs_for_query(query, engine_model)
        ge_response = await _simulate_ge(query, docs, engine_model)
        high_doc, low_doc = _select_contrast_pair(docs, ge_response)
        pairs.append((query, high_doc, low_doc))

    def make_cb(stage: str):
        def cb(s: str, c: int, t: int):
            progress_callback({"stage": s, "completed": c, "total": t})
        return cb

    # Stage 1: Explainer
    explanations = await _stage_explainer(pairs, engine_model, make_cb("explainer"))

    # Stage 2: Extractor
    raw_rules = await _stage_extractor(explanations, engine_model, make_cb("extractor"))

    # Stage 3: Merger
    merged_rules = await _stage_merger(raw_rules, engine_model, make_cb("merger"))

    # Stage 4: Filter
    filtered_rules = await _stage_filter(merged_rules, engine_model, make_cb("filter"))

    return filtered_rules
