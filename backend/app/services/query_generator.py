"""
Generates synthetic search queries for a given topic domain or article content.
Used to seed the rule extraction pipeline.
"""
from __future__ import annotations
import json
from . import llm_client
from .llm_client import get_pipeline_model

SYSTEM = "You are an expert at generating realistic search queries that people use when looking for healthcare and caregiving information."

_ARTICLE_SYSTEM = "You are an expert at analyzing article content and generating realistic search queries that people would use to find this article or closely related content."


def _parse_queries(response: str, num_queries: int) -> list[str]:
    """Parse a JSON or line-by-line list of queries from an LLM response."""
    text = response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        queries = json.loads(text)
        if isinstance(queries, list):
            return [str(q).strip() for q in queries if q][:num_queries]
    except json.JSONDecodeError:
        pass
    # Fallback: line-by-line
    queries = []
    for line in response.split("\n"):
        line = line.strip().lstrip("0123456789.-) ").strip().strip('"').strip("'")
        if line and len(line) > 5:
            queries.append(line)
    return queries[:num_queries]


async def generate_queries(topic: str, num_queries: int = 20, model: str | None = None) -> tuple[list[str], str]:
    """
    Generate num_queries realistic search queries for the given topic.
    Returns a list of query strings.
    """
    if model is None:
        model = get_pipeline_model()
    prompt = f"""Generate {num_queries} realistic search queries that people might type into Google or ask an AI assistant when researching: "{topic}"

Requirements:
- Mix of question-style ("how to...") and keyword-style ("home care cost 2025") queries
- Cover different user intents: informational, navigational, transactional
- Vary in specificity from broad to narrow
- All queries should be plausibly typed by a caregiver or family member
- Include some long-tail queries (4-8 words)

Also suggest a short, descriptive name (3-6 words) for this query set that captures what the queries are about.

Return a JSON object:
{{"queries": ["query 1", "query 2", ...], "suggested_name": "short descriptive name"}}

No markdown, no explanation outside the JSON."""

    response = await llm_client.chat(model, prompt, system=SYSTEM, max_tokens=2048)

    text = response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            raw_queries = parsed.get("queries", [])
            queries = [str(q).strip() for q in raw_queries if q][:num_queries]
            suggested_name = str(parsed.get("suggested_name", "")).strip()
            return queries, suggested_name
    except (json.JSONDecodeError, TypeError):
        pass

    return _parse_queries(response, num_queries), ""


async def generate_queries_from_article(
    article_content: str,
    num_queries: int = 20,
    model: str | None = None,
) -> tuple[list[str], str]:
    """
    Analyze article content and generate search queries a reader would use to find it.
    Returns (queries, suggested_topic) where suggested_topic is a short label inferred
    from the article suitable for use as the query set name / topic field.
    """
    if model is None:
        model = get_pipeline_model()

    # Truncate very long articles to keep within token budget
    excerpt = article_content[:4000]

    prompt = f"""Analyze the following article and generate {num_queries} realistic search queries that someone might type into Google or ask an AI assistant to find this article or closely related content.

ARTICLE:
{excerpt}

Requirements:
- Queries must be directly grounded in the article's actual topics, not generic
- Mix of question-style ("how to...") and keyword-style queries
- Cover different angles the article addresses
- Vary in specificity: some broad, some narrow/long-tail
- Include queries that capture the article's main argument, key facts, and sub-topics
- Also suggest a short, descriptive name (3-6 words) for this query set that captures the general theme of the queries — this is a label for the collection, not the article title. Examples: "Alzheimer's Caregiving Support", "Home Care Cost Planning", "AI Tools for Elderly Care"

Return a JSON object with two keys:
{{
  "queries": ["query 1", "query 2", ...],
  "suggested_topic": "short descriptive query set name"
}}

No markdown, no explanation outside the JSON."""

    response = await llm_client.chat(model, prompt, system=_ARTICLE_SYSTEM, max_tokens=2048)

    text = response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    suggested_topic = ""
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            raw_queries = parsed.get("queries", [])
            queries = [str(q).strip() for q in raw_queries if q][:num_queries]
            suggested_topic = str(parsed.get("suggested_topic", "")).strip()
            return queries, suggested_topic
    except (json.JSONDecodeError, TypeError):
        pass

    # Fallback: treat the whole response as a plain query list
    return _parse_queries(response, num_queries), suggested_topic
