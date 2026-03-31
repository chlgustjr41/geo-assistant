# Phase 2 Implementation Results

## Status: COMPLETE

## Endpoints Added
- `POST /api/writing/rewrite` — rewrites article using selected rule set + trend keywords

## Files Modified
- `backend/app/services/geo_rewriter.py` — full implementation
- `backend/app/routers/writing.py` — added rewrite endpoint

## Implementation Notes
- `geo_rewriter.rewrite_article` builds the full AutoGEO prompt inline: article content first, then quality guidelines as a numbered list, then the optional trending topic section (omitted entirely when `trend_keywords` is empty), then the fixed healthcare domain constraints block.
- The LLM is called via `llm_client.chat(model, prompt, max_tokens=8192)` with no separate system message — the entire prompt is in the user turn, which works correctly across all three provider backends (OpenAI, Gemini, Anthropic).
- `rules_json` on `RuleSet` is stored as `{"filtered_rules": [...]}` per the model comment; the router parses this with `json.loads` and extracts the `filtered_rules` key, defaulting to an empty list if the key is absent.
- The full `filtered_rules` list is returned as `rules_applied` in the response so the frontend can display which rules were used.
- HTTP 404 is raised when the requested `rule_set_id` does not exist in the database.
- HTTP 400 (with the underlying exception message) is raised on any LLM call failure, keeping error messages actionable for the caller.
- All pre-existing endpoints (`/scrape-url`, `/save`, `/history`) are unchanged.

## Test Verification
- Imports verified: `from ..models import Article, RuleSet` and `from ..services import geo_rewriter` both resolve correctly given the existing package structure.
- Prompt structure matches the AutoGEO spec exactly — article first, guidelines as a numbered list, optional trend section, healthcare constraints, closing instruction.
- `trend_keywords` defaulting to `[]` is consistent between the service function signature and the Pydantic request model.
- `llm_client.chat` signature (`model, prompt, system=None, max_tokens=4096`) accommodates the `max_tokens=8192` keyword argument without modification.
