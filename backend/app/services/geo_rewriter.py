"""
AutoGEO rule-based article rewriter with trend keyword injection.

Prompt structure (adapted from AutoGEO paper Section 3.2.1):

  Here is the source article:
  <article content>

  You are given a website article as a source. Your task is to regenerate
  the provided source so that it strictly adheres to the "Quality Guidelines"
  below while preserving all factual information accurately.

  ## Quality Guidelines to Follow:
  <filtered_rules from selected rule set — numbered list>

  ## Trending Topic Context (integrate naturally where relevant):
  <trend keywords, if any>

  ## Healthcare Domain Constraints:
  - This is YMYL healthcare/caregiving content
  - Preserve all medical accuracy — never fabricate statistics
  - Maintain E-E-A-T signals (author credentials, citations, dates)
  - Target 6th-8th grade reading level
  - Include concise answer summaries at the start of each section

  Output only the rewritten article text. No explanations.
"""
from __future__ import annotations

from . import llm_client
from .llm_client import get_pipeline_model

_MERGE_PROMPT = (
    "You are merging multiple GEO (Generative Engine Optimization) rule sets into a single "
    "unified set. Deduplicate redundant rules, resolve conflicts by keeping the more specific "
    "rule, and output a clean numbered list of the merged rules.\n\n"
    "Input rule sets:\n\n"
    "{sections}\n\n"
    "Output only the merged rules as a numbered list (e.g. '1. Rule text'), one per line. "
    "Aim for 15–30 high-quality, actionable rules. No explanations, no headers."
)


async def merge_rules(rule_sets: list[tuple[str, list[str]]]) -> list[str]:
    """LLM-merge multiple rule sets into one deduplicated list."""
    sections = []
    for name, rules in rule_sets:
        numbered = "\n".join(f"  {i + 1}. {r}" for i, r in enumerate(rules))
        sections.append(f"Rule Set — {name}:\n{numbered}")

    prompt = _MERGE_PROMPT.format(sections="\n\n".join(sections))
    raw = await llm_client.chat(get_pipeline_model(), prompt, max_tokens=2048)

    merged: list[str] = []
    for line in raw.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip leading numbering like "1. " or "- "
        if line[0].isdigit() and ". " in line:
            line = line.split(". ", 1)[1]
        elif line.startswith("- "):
            line = line[2:]
        merged.append(line)
    return merged


async def rewrite_article(
    content: str,
    model: str,
    rule_set_rules: list[str],
    trend_keywords: list[str] = [],
) -> str:
    """Returns the rewritten article text."""
    # Build numbered quality guidelines from the rule set
    numbered_rules = "\n".join(
        f"{i + 1}. {rule}" for i, rule in enumerate(rule_set_rules)
    )

    # Build trending topic section only when keywords are provided
    if trend_keywords:
        trend_section = (
            "\n## Trending Topic Context (integrate naturally where relevant):\n"
            + ", ".join(trend_keywords)
            + "\n"
        )
    else:
        trend_section = ""

    prompt = (
        "Here is the source article:\n"
        f"{content}\n\n"
        "You are given a website article as a source. Your task is to regenerate "
        "the provided source so that it strictly adheres to the \"Quality Guidelines\" "
        "below while preserving all factual information accurately.\n\n"
        "## Quality Guidelines to Follow:\n"
        f"{numbered_rules}\n"
        f"{trend_section}"
        "\n## Healthcare Domain Constraints:\n"
        "- This is YMYL healthcare/caregiving content\n"
        "- Preserve all medical accuracy — never fabricate statistics\n"
        "- Maintain E-E-A-T signals (author credentials, citations, dates)\n"
        "- Target 6th-8th grade reading level\n"
        "- Include concise answer summaries at the start of each section\n\n"
        "Output only the rewritten article text. No explanations."
    )

    result = await llm_client.chat(model, prompt, max_tokens=8192)
    return result.strip()
