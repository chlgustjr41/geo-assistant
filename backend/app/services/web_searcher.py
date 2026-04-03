"""
Web search for corpus auto-discovery.

Uses DuckDuckGo (no API key required) to find real internet sources
relevant to a set of queries.  Results are deduplicated and ranked by
how many queries they appeared in.
"""
from __future__ import annotations
import asyncio
import logging
import re
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Domains that are never useful as corpus documents
_SKIP_DOMAINS = {
    "youtube.com", "youtu.be",
    "twitter.com", "x.com",
    "facebook.com", "instagram.com", "linkedin.com",
    "reddit.com", "quora.com",
    "pinterest.com", "tiktok.com",
    "amazon.com", "ebay.com",
    "wikipedia.org",           # too generic
    "google.com", "bing.com",  # search engines
}


def _domain(url: str) -> str:
    return urlparse(url).netloc.lower().removeprefix("www.")


def _is_useful(url: str) -> bool:
    d = _domain(url)
    return d not in _SKIP_DOMAINS and bool(d)


async def _search_one(query: str, max_results: int) -> list[dict]:
    """Run one DuckDuckGo text search in a thread (DDGS is synchronous)."""
    def _run() -> list[dict]:
        from ddgs import DDGS  # package was renamed from duckduckgo_search to ddgs
        return list(DDGS().text(query, max_results=max_results))

    raw = await asyncio.to_thread(_run)
    return [
        {
            "url": r.get("href", ""),
            "title": r.get("title", ""),
            "snippet": r.get("body", ""),
        }
        for r in raw
        if r.get("href") and _is_useful(r.get("href", ""))
    ]


async def search_for_corpus(
    queries: list[str],
    max_results_per_query: int = 8,
    total_cap: int = 50,
) -> list[dict]:
    """
    Search DuckDuckGo for each query sequentially (to avoid rate-limits),
    deduplicate results, and rank by citation frequency across queries.

    Returns list of dicts: {url, title, snippet, hit_count}
      hit_count = number of distinct queries that returned this URL.
    """
    if not queries:
        return []

    url_data: dict[str, dict] = {}   # url → {title, snippet, hit_count}

    for q in queries:
        try:
            results = await _search_one(q, max_results_per_query)
        except Exception as exc:
            logger.warning("Search failed for query %r: %s", q, exc)
            results = []
        for r in results:
            url = r["url"]
            if url in url_data:
                url_data[url]["hit_count"] += 1
            else:
                url_data[url] = {
                    "url": url,
                    "title": r["title"],
                    "snippet": r["snippet"],
                    "hit_count": 1,
                }
        # Small pause to be polite to DuckDuckGo
        await asyncio.sleep(0.4)

    # Sort: higher hit_count first, then alphabetical
    ranked = sorted(url_data.values(), key=lambda x: (-x["hit_count"], x["url"]))
    return ranked[:total_cap]
