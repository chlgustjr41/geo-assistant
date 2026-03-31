"""
Generates synthetic search queries for a given topic domain.
Used to seed the rule extraction pipeline.
"""
from __future__ import annotations
import json
from . import llm_client

SYSTEM = "You are an expert at generating realistic search queries that people use when looking for healthcare and caregiving information."

async def generate_queries(topic: str, num_queries: int = 20, model: str = "gemini-2.5-flash-lite") -> list[str]:
    """
    Generate num_queries realistic search queries for the given topic.
    Returns a list of query strings.
    """
    prompt = f"""Generate {num_queries} realistic search queries that people might type into Google or ask an AI assistant when researching: "{topic}"

Requirements:
- Mix of question-style ("how to...") and keyword-style ("home care cost 2025") queries
- Cover different user intents: informational, navigational, transactional
- Vary in specificity from broad to narrow
- All queries should be plausibly typed by a caregiver or family member
- Include some long-tail queries (4-8 words)

Return ONLY a JSON array of strings. No markdown, no explanation. Example:
["query 1", "query 2", "query 3"]"""

    response = await llm_client.chat(model, prompt, system=SYSTEM, max_tokens=2048)

    # Parse JSON response, with fallback line-by-line parsing
    text = response.strip()
    # Remove markdown code blocks if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        queries = json.loads(text)
        if isinstance(queries, list):
            return [str(q).strip() for q in queries if q][:num_queries]
    except json.JSONDecodeError:
        pass

    # Fallback: parse line by line
    queries = []
    for line in response.split("\n"):
        line = line.strip().lstrip("0123456789.-) ").strip().strip('"').strip("'")
        if line and len(line) > 5:
            queries.append(line)
    return queries[:num_queries]
