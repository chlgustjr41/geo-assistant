"""Scrape article text from a URL using httpx + BeautifulSoup4."""
from __future__ import annotations
import re
import unicodedata
from typing import TypedDict
import httpx
from bs4 import BeautifulSoup, Tag


class ScrapedArticle(TypedDict):
    title: str
    content: str
    meta_description: str
    word_count: int


_SCRAPE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

# Roles/classes that indicate non-content containers.
# Each keyword is wrapped in word-boundary anchors (\b) so that e.g. "ad" does
# not match inside "headings" or "breadcrumb" inside "breadcrumbs-wrapper".
_NOISE_KEYWORDS = [
    "nav", "menu", "sidebar", "footer", "header", "breadcrumb", "pagination",
    "social", "share", "comment", "widget", "banner", "popup", "modal",
    "cookie", "newsletter", "subscribe", "related", "recommend", "tag-cloud",
    "author-bio",
    # ad-specific: require dash/underscore/boundary context to avoid false positives
    # matches "ad-container", "ads", "ad_slot", but not "headings", "loading", "readonly"
    r"(?:^|[\s_-])ad(?:s|[\s_-]|$)",
]
_NOISE_PATTERNS = re.compile(
    r"(?:" + "|".join(rf"\b{kw}\b" if not kw.startswith("(?") else kw for kw in _NOISE_KEYWORDS) + r")",
    re.IGNORECASE,
)

# Minimum word count to consider a div-extracted line as content (not nav/label)
_MIN_LINE_WORDS = 5


def _clean_text(text: str) -> str:
    """Normalize Unicode to remove encoding artifacts and compatibility characters."""
    # NFKC: compatibility decomposition + canonical composition
    # converts e.g. \xa0 (non-breaking space) → space, ligatures → ascii equivalents
    text = unicodedata.normalize("NFKC", text)
    # Strip control characters (except normal whitespace)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Cc" or ch in "\n\r\t")
    # Collapse runs of blank lines to a single blank line
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _is_binary_content(text: str, sample_size: int = 512) -> bool:
    """Return True if text looks like raw binary/compressed data rather than readable prose."""
    sample = text[:sample_size]
    if not sample:
        return False
    non_text = sum(
        1 for ch in sample
        if not (ch.isprintable() or ch in "\n\r\t")
    )
    return (non_text / len(sample)) > 0.20


def _is_noise_element(tag: Tag) -> bool:
    """Return True if the element looks like a navigation/boilerplate container."""
    if not hasattr(tag, "attrs") or tag.attrs is None:
        return False
    for attr in ("class", "id", "role"):
        val = tag.get(attr, "")
        text = " ".join(val) if isinstance(val, list) else str(val)
        if _NOISE_PATTERNS.search(text):
            return True
    return False


def _extract_semantic(container: Tag) -> str:
    """Extract text from semantic content tags (p, headings, li)."""
    parts = []
    for el in container.find_all(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "td"]):
        text = el.get_text(separator=" ", strip=True)
        if text and len(text.split()) >= _MIN_LINE_WORDS:
            parts.append(text)
    return "\n\n".join(parts)


def _extract_div_text(container: Tag) -> str:
    """Fallback: walk all leaf-ish elements and collect lines with enough words."""
    seen: set[str] = set()
    parts = []
    for el in container.find_all(True):
        # Only look at leaf-ish nodes (no nested block children)
        if el.find(["p", "div", "section", "article", "ul", "ol", "table"]):
            continue
        if _is_noise_element(el):
            continue
        text = el.get_text(separator=" ", strip=True)
        if not text or len(text.split()) < _MIN_LINE_WORDS:
            continue
        if text in seen:
            continue
        seen.add(text)
        parts.append(text)
    return "\n\n".join(parts)


async def scrape_url(url: str) -> ScrapedArticle:
    # Normalize URL: add https:// if no scheme provided
    if url and not url.startswith(("http://", "https://")):
        url = "https://" + url
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers=_SCRAPE_HEADERS)
        resp.raise_for_status()

    # Use raw bytes so BeautifulSoup can detect encoding from the HTML <meta charset>
    # tag rather than relying solely on the HTTP Content-Type header, which many sites
    # omit or set incorrectly (e.g. Wix-based sites like careyaya.org).
    soup = BeautifulSoup(resp.content, "html.parser")

    # Title
    title = ""
    if h1 := soup.find("h1"):
        title = h1.get_text(strip=True)
    elif t := soup.find("title"):
        title = t.get_text(strip=True)

    # Meta description
    meta_desc = ""
    if meta := soup.find("meta", attrs={"name": "description"}):
        meta_desc = meta.get("content", "")

    # Remove boilerplate elements before any content extraction.
    # Preserve anything inside <article> or <main> — those are content containers.
    content_roots = set()
    for cr in soup.find_all(["article", "main"]):
        content_roots.add(id(cr))
        for desc in cr.descendants:
            content_roots.add(id(desc))

    for tag in soup.find_all(["nav", "footer", "script", "style", "aside", "form",
                               "noscript", "iframe", "svg"]):
        if id(tag) not in content_roots:
            tag.decompose()
    # Also remove noise containers by class/id/role, but not inside article/main
    for tag in soup.find_all(True):
        if id(tag) in content_roots:
            continue
        if _is_noise_element(tag):
            tag.decompose()

    # Strategy 1: semantic tags inside article/main
    container = soup.find("article") or soup.find("main")
    content = _extract_semantic(container) if container else ""

    # Strategy 2: semantic tags anywhere in body (sites that skip article/main)
    if len(content.split()) < 80:
        body = soup.find("body")
        if body:
            content = _extract_semantic(body)

    # Strategy 3: div-based extraction (common in CMS/Wix/Webflow sites)
    if len(content.split()) < 80:
        body = soup.find("body")
        if body:
            content = _extract_div_text(body)

    # Strategy 4: plain text dump as last resort
    if len(content.split()) < 30:
        body = soup.find("body")
        content = body.get_text(separator="\n", strip=True) if body else soup.get_text(separator="\n", strip=True)

    title = _clean_text(title)
    content = _clean_text(content)

    if _is_binary_content(content):
        raise ValueError(
            "Scraped content appears to be binary or compressed data, not readable text. "
            "The server may have returned an unsupported encoding. "
            f"Content-Type was: {resp.headers.get('content-type', 'unknown')}, "
            f"Content-Encoding was: {resp.headers.get('content-encoding', 'none')}."
        )

    if len(content.split()) < 20:
        raise ValueError(
            "Could not extract readable text from this page. "
            "The site may require JavaScript rendering or restrict automated access."
        )

    return ScrapedArticle(
        title=title,
        content=content,
        meta_description=meta_desc,
        word_count=len(content.split()),
    )
