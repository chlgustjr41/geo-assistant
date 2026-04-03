"""Unified async LLM client for OpenAI, Google Gemini, and Anthropic Claude."""
from __future__ import annotations
from typing import Optional
import asyncio
import os
import random
import httpx
from ..config import get_openai_key, get_google_key, get_anthropic_key, _key_is_configured

PROVIDER_MAP: dict[str, str] = {
    # OpenAI
    "gpt-4o-mini": "openai",
    "gpt-4o": "openai",
    "gpt-4.1-mini": "openai",
    "gpt-4.1": "openai",
    "gpt-4.5": "openai",
    "o4-mini": "openai",
    # Google Gemini
    "gemini-2.5-flash-lite": "google",
    "gemini-2.5-flash": "google",
    "gemini-2.5-pro": "google",
    "gemini-3-flash-preview": "google",
    # Anthropic Claude (current models only — 3.5 models deprecated/404)
    "claude-haiku-4-5-20251001": "anthropic",
    "claude-sonnet-4-6": "anthropic",
    "claude-opus-4-6": "anthropic",
    # Legacy aliases — kept for backwards compat with existing rule sets in DB
    "claude-3-5-haiku-20241022": "anthropic",
    "claude-3-5-sonnet-20241022": "anthropic",
}

# Map deprecated Anthropic 3.5 model IDs to their current replacements
ANTHROPIC_MODEL_ALIASES: dict[str, str] = {
    "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
    "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
}

# Gemini model name mapping (model-id → actual Generative Language API name)
GEMINI_MODEL_MAP: dict[str, str] = {
    "gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
    "gemini-2.5-flash": "gemini-2.5-flash",
    "gemini-2.5-pro": "gemini-2.5-pro",
    "gemini-3-flash-preview": "gemini-3-flash-preview",
}


def get_cheapest_model() -> str:
    """Return the cheapest available model based on which API keys are configured."""
    gk = get_google_key()
    ok = get_openai_key()
    ak = get_anthropic_key()
    if len(gk) > 10:
        return "gemini-2.5-flash-lite"
    if len(ok) > 10:
        return "gpt-4o-mini"
    if len(ak) > 10:
        return "claude-haiku-4-5-20251001"
    return "gemini-2.5-flash-lite"  # final fallback


# Legacy constant — use get_cheapest_model() for runtime selection
CHEAPEST_MODEL = "gemini-2.5-flash-lite"

_PIPELINE_FALLBACK = "claude-sonnet-4-6"


def get_pipeline_model() -> str:
    """Return the model for all internal pipeline stages (rule extraction, rewriting, evaluation).

    Uses DEFAULT_MODEL from Settings if configured; falls back to claude-sonnet-4-6.
    Reads os.environ directly so Settings changes take effect immediately without restart.
    """
    return os.getenv("DEFAULT_MODEL") or _PIPELINE_FALLBACK


def get_provider(model: str) -> str:
    return PROVIDER_MAP.get(model, "openai")


async def chat(
    model: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 4096,
) -> str:
    provider = get_provider(model)
    if provider == "openai":
        return await _openai_chat(model, prompt, system, max_tokens)
    elif provider == "google":
        return await _gemini_chat(model, prompt, system, max_tokens)
    else:
        return await _anthropic_chat(model, prompt, system, max_tokens)


async def _openai_chat(
    model: str, prompt: str, system: Optional[str], max_tokens: int
) -> str:
    api_key = get_openai_key()
    if not _key_is_configured(api_key):
        raise ValueError("OpenAI API key is not configured. Add OPENAI_API_KEY to .env or via Settings.")
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    max_retries = 6
    base_delay = 5.0  # seconds

    async with httpx.AsyncClient(timeout=120) as client:
        for attempt in range(max_retries):
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "messages": messages, "max_tokens": max_tokens},
            )
            if resp.status_code == 429:
                if attempt == max_retries - 1:
                    resp.raise_for_status()
                # Honour Retry-After header if present, otherwise exponential backoff + jitter
                retry_after = resp.headers.get("retry-after")
                wait = float(retry_after) if retry_after else base_delay * (2 ** attempt) + random.uniform(0, 2)
                await asyncio.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    raise RuntimeError("OpenAI request failed after retries")


async def _gemini_chat(
    model: str, prompt: str, system: Optional[str], max_tokens: int
) -> str:
    api_key = get_google_key()
    if not _key_is_configured(api_key):
        raise ValueError("Google API key is not configured. Add GOOGLE_API_KEY to .env or via Settings.")
    api_model = GEMINI_MODEL_MAP.get(model, model)

    full_prompt = (system + "\n\n" + prompt) if system else prompt

    # Reserve up to 25% of the token budget for internal reasoning (thinking).
    # This guarantees at least 75% of maxOutputTokens for the actual response
    # and prevents MAX_TOKENS finishReason caused by thinking consuming all tokens.
    # Gemini 2.5 Pro requires thinkingBudget >= 128; Flash can go lower.
    thinking_budget = max(128, max_tokens // 4)
    generation_config: dict = {
        "maxOutputTokens": max_tokens,
        "thinkingConfig": {"thinkingBudget": thinking_budget},
    }

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{api_model}:generateContent?key={api_key}",
            json={
                "contents": [{"parts": [{"text": full_prompt}]}],
                "generationConfig": generation_config,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        candidate = data["candidates"][0]
        # content may be absent on safety blocks or other non-STOP finish reasons
        content = candidate.get("content")
        if not content:
            finish = candidate.get("finishReason", "UNKNOWN")
            raise ValueError(f"Gemini returned no content (finishReason: {finish})")
        parts = content.get("parts", [])
        # Prefer non-thought text parts (actual response); fall back to all text parts
        # in case the model tags its output as thought (seen on some Flash/Pro versions).
        text_parts = [p["text"] for p in parts if not p.get("thought") and "text" in p]
        if not text_parts:
            text_parts = [p["text"] for p in parts if "text" in p]
        if not text_parts:
            finish = candidate.get("finishReason", "UNKNOWN")
            raise ValueError(f"Gemini returned no text in response (finishReason: {finish})")
        return text_parts[-1].strip()


async def _anthropic_chat(
    model: str, prompt: str, system: Optional[str], max_tokens: int
) -> str:
    api_key = get_anthropic_key()
    if not _key_is_configured(api_key):
        raise ValueError("Anthropic API key is not configured. Add ANTHROPIC_API_KEY to .env or via Settings.")
    # Resolve deprecated model aliases to current replacements
    resolved_model = ANTHROPIC_MODEL_ALIASES.get(model, model)
    body: dict = {
        "model": resolved_model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        body["system"] = system

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=body,
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"]


async def test_key(provider: str) -> bool:
    """Test if an API key works by making a minimal call."""
    test_model = {
        "openai": "gpt-4o-mini",
        "google": "gemini-2.5-flash-lite",
        "anthropic": "claude-haiku-4-5-20251001",
    }.get(provider)
    if not test_model:
        return False
    try:
        await chat(test_model, "Say ok", max_tokens=5)
        return True
    except Exception:
        return False
