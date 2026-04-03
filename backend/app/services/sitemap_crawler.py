"""
Sitemap crawler + query-relevance ranker for corpus auto-discovery.

Flow:
  1. Fetch /robots.txt → find Sitemap: lines
  2. Try candidate sitemap URLs (sitemap.xml, sitemap_index.xml, …)
  3. Parse XML; if sitemap index, recursively fetch child sitemaps
  4. Filter out non-article URLs (tags, categories, authors, pagination, …)
  5. Rank remaining URLs by keyword overlap with the provided queries
"""
from __future__ import annotations
import re
import xml.etree.ElementTree as ET
from urllib.parse import urlparse
import httpx

# URL path segments that signal non-article pages
_SKIP_RE = re.compile(
    r"/(tag|tags|category|categories|author|authors|page/\d|feed|"
    r"wp-json|wp-admin|wp-content|search|archives?|login|register|"
    r"cart|checkout|account)(/|$|\?)",
    re.IGNORECASE,
)

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GEOAssistant/1.0)"}


def _parse_sitemap_xml(xml_text: str) -> list[str]:
    """Return all <loc> URLs from a sitemap or sitemap-index document."""
    try:
        # Strip namespace to simplify parsing
        clean = re.sub(r'\s+xmlns(?::\w+)?="[^"]+"', "", xml_text)
        root = ET.fromstring(clean)
        return [loc.text.strip() for loc in root.iter("loc") if loc.text and loc.text.strip()]
    except Exception:
        return []


def _is_article_url(url: str) -> bool:
    path = urlparse(url).path
    if _SKIP_RE.search(path):
        return False
    segments = [s for s in path.split("/") if s]
    # Must have at least one non-trivial path segment
    return bool(segments)


def _slug_to_text(url: str) -> str:
    """Convert URL path slug to readable text for BM25 scoring."""
    path = urlparse(url).path.rstrip("/")
    segments = [s for s in path.split("/") if s]
    if not segments:
        return ""
    slug = segments[-1]
    slug = re.sub(r"\.(html?|php|aspx?)$", "", slug)
    return slug.replace("-", " ").replace("_", " ")


async def fetch_sitemap_urls(website_url: str, max_pool: int = 500) -> list[str]:
    """Fetch all article-like URLs from a website's sitemap(s)."""
    base = website_url.rstrip("/")

    async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=_HEADERS) as client:
        # Step 1: check robots.txt for Sitemap directives
        sitemap_candidates: list[str] = []
        try:
            robots = await client.get(f"{base}/robots.txt", timeout=10)
            for line in robots.text.splitlines():
                if line.lower().startswith("sitemap:"):
                    sitemap_candidates.append(line.split(":", 1)[1].strip())
        except Exception:
            pass

        # Step 2: common fallback paths
        if not sitemap_candidates:
            sitemap_candidates = [
                f"{base}/sitemap.xml",
                f"{base}/sitemap_index.xml",
                f"{base}/post-sitemap.xml",
                f"{base}/news-sitemap.xml",
            ]

        article_urls: list[str] = []

        for sm_url in sitemap_candidates:
            try:
                resp = await client.get(sm_url, timeout=15)
                if resp.status_code != 200:
                    continue
                locs = _parse_sitemap_xml(resp.text)
                if not locs:
                    continue

                # Split into child sitemaps vs. page URLs
                child_sitemaps = [u for u in locs if "sitemap" in urlparse(u).path.lower()]
                page_urls = [u for u in locs if "sitemap" not in urlparse(u).path.lower()]

                # Fetch up to 6 child sitemaps (covers most blog setups)
                for child in child_sitemaps[:6]:
                    try:
                        cr = await client.get(child, timeout=15)
                        if cr.status_code == 200:
                            page_urls.extend(
                                u for u in _parse_sitemap_xml(cr.text)
                                if "sitemap" not in urlparse(u).path.lower()
                            )
                    except Exception:
                        continue

                article_urls.extend(u for u in page_urls if _is_article_url(u))

                if article_urls:
                    break  # stop at first sitemap that yields results

            except Exception:
                continue

        # Deduplicate preserving order
        seen: set[str] = set()
        unique: list[str] = []
        for u in article_urls:
            if u not in seen:
                seen.add(u)
                unique.append(u)

        return unique[:max_pool]


def rank_urls_by_queries(
    urls: list[str],
    queries: list[str],
    top_n: int = 20,
) -> list[dict]:
    """
    Score each URL by keyword overlap with the combined query text and return top_n.

    Returns list of dicts: {url, title, score, score_max}
    """
    if not urls or not queries:
        # No ranking possible — return first top_n as-is
        return [
            {"url": u, "title": _slug_to_text(u).title() or u, "score": 0}
            for u in urls[:top_n]
        ]

    # Build query token set (deduplicated, stop-words stripped)
    _STOP = {"a", "an", "the", "and", "or", "of", "to", "in", "for", "on", "with", "is", "are", "how"}
    query_tokens = [
        w for w in re.findall(r"[a-z]+", " ".join(queries).lower())
        if w not in _STOP and len(w) > 2
    ]
    query_set = set(query_tokens)

    scored: list[dict] = []
    for url in urls:
        slug_text = _slug_to_text(url)
        doc_words = set(re.findall(r"[a-z]+", slug_text.lower()))
        score = len(doc_words & query_set)
        scored.append({
            "url": url,
            "title": slug_text.title() if slug_text else url,
            "score": score,
        })

    scored.sort(key=lambda x: (-x["score"], x["url"]))
    return scored[:top_n]
