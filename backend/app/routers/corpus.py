from __future__ import annotations
import asyncio
import json
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import CorpusDocument, QuerySet

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/corpus", tags=["corpus"])


def _is_binary_content(text: str, sample_size: int = 512) -> bool:
    """Mirror of article_scraper._is_binary_content — detect stored binary garbage."""
    sample = text[:sample_size]
    if not sample:
        return False
    non_text = sum(1 for ch in sample if not (ch.isprintable() or ch in "\n\r\t"))
    return (non_text / len(sample)) > 0.20


@router.get("")
def list_corpus(db: Session = Depends(get_db)):
    docs = db.query(CorpusDocument).order_by(CorpusDocument.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "title": d.title,
            "source_url": d.source_url,
            "word_count": d.word_count,
            "query_set_id": d.query_set_id,
            "corpus_set_id": d.corpus_set_id,
            "created_at": d.created_at.isoformat(),
            "snippet": d.content[:200],
        }
        for d in docs
    ]


@router.get("/count")
def count_corpus(db: Session = Depends(get_db)):
    return {"count": db.query(CorpusDocument).count()}


class AddTextRequest(BaseModel):
    title: str = ""
    content: str
    source_url: str | None = None
    query_set_id: str | None = None
    corpus_set_id: str | None = None


@router.post("/add-text")
def add_text(body: AddTextRequest, db: Session = Depends(get_db)):
    if not body.content.strip():
        raise HTTPException(400, "Content cannot be empty")
    word_count = len(body.content.split())
    doc = CorpusDocument(
        title=body.title or f"Document ({word_count} words)",
        source_url=body.source_url,
        content=body.content,
        word_count=word_count,
        query_set_id=body.query_set_id,
        corpus_set_id=body.corpus_set_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "title": doc.title, "word_count": doc.word_count}


class AddUrlRequest(BaseModel):
    url: str
    title: str = ""
    query_set_id: str | None = None
    corpus_set_id: str | None = None


@router.post("/add-url")
async def add_url(body: AddUrlRequest, db: Session = Depends(get_db)):
    from ..services.article_scraper import scrape_url
    try:
        scraped = await scrape_url(body.url)
    except Exception as e:
        raise HTTPException(400, f"Failed to scrape URL: {e}")
    word_count = len(scraped["content"].split())
    doc = CorpusDocument(
        title=body.title or scraped.get("title") or body.url,
        source_url=body.url,
        content=scraped["content"],
        word_count=word_count,
        query_set_id=body.query_set_id,
        corpus_set_id=body.corpus_set_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "title": doc.title, "word_count": doc.word_count}


@router.delete("/{doc_id}")
def delete_doc(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(CorpusDocument).filter(CorpusDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    db.delete(doc)
    db.commit()
    return {"ok": True}


class BulkDeleteRequest(BaseModel):
    ids: list[str]


@router.post("/bulk-delete")
def bulk_delete(body: BulkDeleteRequest, db: Session = Depends(get_db)):
    db.query(CorpusDocument).filter(CorpusDocument.id.in_(body.ids)).delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted": len(body.ids)}


# ---------------------------------------------------------------------------
# Auto-discovery via query set
# ---------------------------------------------------------------------------

class DiscoverFromQuerySetRequest(BaseModel):
    query_set_id: str
    max_urls: int = 20


@router.post("/discover-from-queryset")
async def discover_from_queryset(body: DiscoverFromQuerySetRequest, db: Session = Depends(get_db)):
    """Search the web using all queries from a saved QuerySet."""
    from ..services.web_searcher import search_for_corpus

    qs = db.query(QuerySet).filter(QuerySet.id == body.query_set_id).first()
    if not qs:
        raise HTTPException(404, "Query set not found")

    try:
        queries: list[str] = json.loads(qs.queries_json)
    except Exception:
        queries = []

    if not queries:
        raise HTTPException(400, "Query set has no queries")

    logger.info(
        "Discovering corpus for query set '%s' using %d queries, capped at %d URLs",
        qs.name, len(queries), body.max_urls,
    )

    try:
        results = await search_for_corpus(
            queries,
            max_results_per_query=6,
            total_cap=body.max_urls,
        )
    except Exception as e:
        logger.exception("Web search failed for query set %s", body.query_set_id)
        raise HTTPException(500, f"Web search failed: {e}")

    return {
        "urls": results,
        "total_found": len(results),
        "queries_used": queries,
        "query_set_name": qs.name,
    }


# ---------------------------------------------------------------------------
# Bulk-add by URL list (scrape concurrently)
# ---------------------------------------------------------------------------

class BulkAddUrlsRequest(BaseModel):
    urls: list[str]
    query_set_id: str | None = None
    corpus_set_id: str | None = None


@router.post("/bulk-add-urls")
async def bulk_add_urls(body: BulkAddUrlsRequest, db: Session = Depends(get_db)):
    """Scrape a list of URLs concurrently and add them all to the corpus."""
    from ..services.article_scraper import scrape_url

    if not body.urls:
        raise HTTPException(400, "No URLs provided")
    if len(body.urls) > 50:
        raise HTTPException(400, "Maximum 50 URLs per batch")

    semaphore = asyncio.Semaphore(5)  # max 5 concurrent scrapes

    async def _scrape_one(url: str) -> dict:
        async with semaphore:
            try:
                scraped = await scrape_url(url)
                return {"url": url, "scraped": scraped, "error": None}
            except Exception as e:
                return {"url": url, "scraped": None, "error": str(e)}

    results = await asyncio.gather(*[_scrape_one(u) for u in body.urls])

    added = 0
    failed: list[dict] = []
    for r in results:
        if r["scraped"]:
            s = r["scraped"]
            wc = len(s["content"].split())
            doc = CorpusDocument(
                title=s.get("title") or r["url"],
                source_url=r["url"],
                content=s["content"],
                word_count=wc,
                query_set_id=body.query_set_id,
                corpus_set_id=body.corpus_set_id,
            )
            db.add(doc)
            added += 1
        else:
            failed.append({"url": r["url"], "error": r["error"]})

    db.commit()
    return {"added": added, "failed": failed}


# ---------------------------------------------------------------------------
# Binary-content audit + purge
# ---------------------------------------------------------------------------

@router.get("/audit-binary")
def audit_binary_docs(db: Session = Depends(get_db)):
    """Return IDs and titles of documents whose content looks like binary/compressed data."""
    docs = db.query(CorpusDocument).all()
    bad = [
        {"id": d.id, "title": d.title, "source_url": d.source_url}
        for d in docs
        if _is_binary_content(d.content or "")
    ]
    return {"count": len(bad), "documents": bad}


@router.post("/purge-binary")
def purge_binary_docs(db: Session = Depends(get_db)):
    """Delete all documents whose content looks like binary/compressed data."""
    docs = db.query(CorpusDocument).all()
    bad_ids = [d.id for d in docs if _is_binary_content(d.content or "")]
    if bad_ids:
        db.query(CorpusDocument).filter(CorpusDocument.id.in_(bad_ids)).delete(synchronize_session=False)
        db.commit()
    return {"deleted": len(bad_ids)}
