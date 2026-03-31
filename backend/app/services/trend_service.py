"""
Google Trends service using trendspyg 0.4.0 RSS API.

trendspyg 0.4.0 uses RSS-based trending topics (real-time, no rate limits).
The RSS feed returns ~10-20 currently trending topics for a geo with traffic
volumes. It does NOT support topic-specific queries or time series data.

Flow:
  1. Fetch current trending topics via RSS for the geo (cached 1 hour in SQLite)
  2. Filter: topics whose words overlap with the user's topic go into rising_queries
  3. All topics sorted by traffic go into top_queries
  4. interest_over_time is always [] (TrendChart renders null for empty data)
"""
from __future__ import annotations
import asyncio
import json
import re
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import TrendCache

_STOPWORDS = {"the", "a", "an", "for", "of", "in", "and", "or", "to", "with", "is", "are", "on"}


def _parse_traffic(traffic_str: str) -> int:
    """Parse traffic strings like '200+', '2K+', '10K+' to integers for sorting."""
    if not traffic_str:
        return 0
    clean = re.sub(r"[+,\s]", "", str(traffic_str)).upper()
    try:
        if "M" in clean:
            return int(float(clean.replace("M", "")) * 1_000_000)
        if "K" in clean:
            return int(float(clean.replace("K", "")) * 1_000)
        return int(clean)
    except (ValueError, TypeError):
        return 0


def _fetch_rss_sync(geo: str) -> list[dict]:
    """Fetch RSS trending topics synchronously (runs in thread executor)."""
    from trendspyg import download_google_trends_rss

    # trendspyg RSS only accepts country codes; empty string = worldwide is not supported
    rss_geo = geo if geo else "US"

    try:
        raw = download_google_trends_rss(
            geo=rss_geo,
            output_format="dict",
            include_images=False,
            include_articles=False,
            cache=False,
        )
        return raw or []
    except Exception as e:
        raise RuntimeError(f"RSS fetch failed for geo={rss_geo}: {e}")


def _build_result(raw_trends: list[dict], topic: str) -> dict:
    """Convert raw RSS trends into TrendResult shape."""
    all_queries = []
    for t in raw_trends:
        trend_name = t.get("trend", "").strip()
        if not trend_name:
            continue
        traffic_str = str(t.get("traffic", "0"))
        all_queries.append({
            "query": trend_name,
            "value": traffic_str,          # keep original string e.g. "2K+"
            "_sort_key": _parse_traffic(traffic_str),
        })

    # Sort descending by traffic
    all_queries.sort(key=lambda x: x["_sort_key"], reverse=True)

    # Strip internal sort key from output
    top_queries = [{"query": q["query"], "value": q["value"]} for q in all_queries]

    # Rising = topics that contain any non-stopword from the user's topic
    topic_words = {w.lower() for w in topic.split()} - _STOPWORDS
    if topic_words:
        rising_queries = [
            q for q in top_queries
            if any(w in q["query"].lower() for w in topic_words)
        ]
    else:
        rising_queries = []

    # Fallback: if no topic match, show top 5 as rising
    if not rising_queries:
        rising_queries = top_queries[:5]

    return {
        "interest_over_time": [],  # RSS has no time series; TrendChart hides itself for []
        "rising_queries": rising_queries,
        "top_queries": top_queries,
    }


async def discover_trends(
    topic: str,
    timeframe: str = "rss",
    geo: str = "US",
    db: Session | None = None,
) -> dict:
    """
    Fetch currently trending topics via trendspyg RSS with 1-hour SQLite cache.

    The timeframe parameter is accepted for interface compatibility but ignored —
    RSS always returns real-time data.
    """
    cache_key = f"rss|{geo or 'US'}"

    # --- Cache check (1 h TTL) ---
    if db is not None:
        existing = db.query(TrendCache).filter(TrendCache.query == cache_key).first()
        if existing:
            age = datetime.now(timezone.utc) - existing.cached_at.replace(tzinfo=timezone.utc)
            if age < timedelta(hours=existing.ttl_hours):
                raw_trends = json.loads(existing.result_json)
                return _build_result(raw_trends, topic)

    # --- Fetch fresh ---
    try:
        loop = asyncio.get_event_loop()
        raw_trends = await loop.run_in_executor(None, _fetch_rss_sync, geo)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Trends fetch failed: {e}")

    if not raw_trends:
        raise HTTPException(status_code=404, detail="No trending topics returned for this region.")

    # --- Cache raw trends ---
    if db is not None:
        db.query(TrendCache).filter(TrendCache.query == cache_key).delete()
        db.add(TrendCache(
            query=cache_key,
            timeframe="rss",
            geo=geo or "US",
            result_json=json.dumps(raw_trends),
            cached_at=datetime.now(timezone.utc),
            ttl_hours=1,
        ))
        db.commit()

    return _build_result(raw_trends, topic)
