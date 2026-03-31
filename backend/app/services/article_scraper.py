"""Scrape article text from a URL using httpx + BeautifulSoup4."""
from __future__ import annotations
from typing import TypedDict
import httpx
from bs4 import BeautifulSoup


class ScrapedArticle(TypedDict):
    title: str
    content: str
    meta_description: str
    word_count: int


async def scrape_url(url: str) -> ScrapedArticle:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

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

    # Remove boilerplate elements
    for tag in soup.find_all(["nav", "header", "footer", "script", "style", "aside", "form"]):
        tag.decompose()

    # Extract main content
    article_el = soup.find("article") or soup.find("main") or soup.find("body")
    if article_el:
        paragraphs = article_el.find_all(["p", "h1", "h2", "h3", "h4", "h5", "li"])
        content = "\n\n".join(
            p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)
        )
    else:
        content = soup.get_text(separator="\n", strip=True)

    return ScrapedArticle(
        title=title,
        content=content,
        meta_description=meta_desc,
        word_count=len(content.split()),
    )
