"""BM25 + synthetic competitor document retrieval for GEO evaluation."""
from __future__ import annotations
import asyncio
from . import llm_client
from .llm_client import get_pipeline_model

_SYNTHETIC_DOC_PROMPT = (
    "Generate a realistic blog post excerpt (150-250 words) about the following topic "
    "that would appear in search results. Write natural, informative content as if from "
    "a real healthcare/caregiving website. Output only the article text, no titles or headers.\n\n"
    "Topic query: {query}\n"
    "Document perspective: {style}"
)

_DOC_STYLES = [
    "authoritative medical reference site",
    "caregiver support community",
    "nonprofit healthcare organization",
    "clinical research summary for general audiences",
    "patient and family advocacy group",
]


async def generate_synthetic_competitors(
    query: str,
    num_docs: int,
    model: str | None = None,
) -> list[str]:
    """Generate synthetic competing documents for a given query using the pipeline model."""
    if model is None:
        model = get_pipeline_model()
    tasks = [
        llm_client.chat(
            model,
            _SYNTHETIC_DOC_PROMPT.format(query=query, style=_DOC_STYLES[i % len(_DOC_STYLES)]),
            max_tokens=1024,
        )
        for i in range(num_docs)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    docs: list[str] = []
    for r in results:
        if isinstance(r, Exception):
            docs.append(f"Helpful information about {query} from healthcare resources.")
        else:
            docs.append(str(r).strip())
    return docs


def bm25_retrieve(
    query: str,
    documents: list[str],
    top_k: int,
    force_include: list[int] | None = None,
) -> list[tuple[int, str]]:
    """Return (original_index, doc_text) pairs ranked by BM25 score for the query.

    If force_include is given, those document indices are guaranteed to appear in
    the result (in their BM25-ranked position, or appended at the natural rank if
    they would otherwise be cut off).  The remaining top_k − len(force_include)
    slots are filled by the highest-scoring non-forced documents.
    """
    try:
        from rank_bm25 import BM25Okapi
    except ImportError:
        return list(enumerate(documents))[:top_k]

    tokenized_docs = [doc.lower().split() for doc in documents]
    tokenized_query = query.lower().split()

    bm25 = BM25Okapi(tokenized_docs)
    scores = bm25.get_scores(tokenized_query)

    ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)

    if not force_include:
        return [(i, documents[i]) for i in ranked[:top_k]]

    forced = set(force_include)
    result: list[int] = []
    for i in ranked:
        if len(result) >= top_k:
            break
        if i in forced:
            result.append(i)
            forced.discard(i)
        elif len(result) + len(forced) < top_k:
            # Only add a non-forced doc if there's room after reserving
            # slots for any forced docs not yet encountered
            result.append(i)

    # If any forced indices were never reached (extremely low BM25), append them
    for i in forced:
        if len(result) < top_k:
            result.append(i)

    return [(i, documents[i]) for i in result]
