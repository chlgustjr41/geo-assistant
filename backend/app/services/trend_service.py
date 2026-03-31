"""
Google Trends service using trendspyg (MIT, active pytrends replacement).
Caches all results in TrendCache table with 24-hour TTL.
Healthcare category ID = 45.
"""

import json
import asyncio
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import TrendCache


def _fetch_sync(topic: str, timeframe: str, geo: str) -> dict:
    """Synchronous trendspyg fetch — runs in a thread pool executor."""
    try:
        from trendspyg import TrendReq
    except ImportError as e:
        raise RuntimeError(f"trendspyg is not installed: {e}")

    try:
        trendspyg_obj = TrendReq(hl="en-US", tz=360)
        trendspyg_obj.build_payload([topic], timeframe=timeframe, geo=geo, gprop="")

        # --- Interest over time ---
        iot_df = trendspyg_obj.interest_over_time()

        interest_over_time = []
        if iot_df is not None and not iot_df.empty:
            # Drop isPartial column if present
            if "isPartial" in iot_df.columns:
                iot_df = iot_df.drop(columns=["isPartial"])
            for date_idx, row in iot_df.iterrows():
                date_str = date_idx.strftime("%Y-%m")
                # Use first non-index column value (the topic column)
                value = int(row.iloc[0]) if len(row) > 0 else 0
                interest_over_time.append({"date": date_str, topic: value})

        # --- Related queries ---
        related = trendspyg_obj.related_queries()

        rising_queries = []
        top_queries = []

        if related and topic in related:
            topic_related = related[topic]

            # Rising queries
            rising_df = topic_related.get("rising") if topic_related else None
            if rising_df is not None and not rising_df.empty:
                for _, row in rising_df.iterrows():
                    query_val = row.get("query", "")
                    raw_value = row.get("value", 0)
                    # value may be "Breakout" string or integer
                    if isinstance(raw_value, str):
                        value = raw_value
                    else:
                        try:
                            value = int(raw_value)
                        except (ValueError, TypeError):
                            value = str(raw_value)
                    rising_queries.append({"query": query_val, "value": value})

            # Top queries
            top_df = topic_related.get("top") if topic_related else None
            if top_df is not None and not top_df.empty:
                for _, row in top_df.iterrows():
                    query_val = row.get("query", "")
                    raw_value = row.get("value", 0)
                    try:
                        value = int(raw_value)
                    except (ValueError, TypeError):
                        value = str(raw_value)
                    top_queries.append({"query": query_val, "value": value})

        return {
            "interest_over_time": interest_over_time,
            "rising_queries": rising_queries,
            "top_queries": top_queries,
        }

    except Exception as e:
        raise RuntimeError(f"Google Trends request failed: {e}")


async def discover_trends(
    topic: str,
    timeframe: str = "today 12-m",
    geo: str = "US",
    db: Session = None,
) -> dict:
    """
    Fetch Google Trends data for a topic with 24-hour SQLite caching.

    Returns a dict with keys:
      - interest_over_time: list of {"date": "YYYY-MM", <topic>: int}
      - rising_queries: list of {"query": str, "value": int | str}
      - top_queries: list of {"query": str, "value": int}
    """
    cache_key = f"{topic}|{timeframe}|{geo}"

    # --- Cache check ---
    if db is not None:
        existing = db.query(TrendCache).filter(TrendCache.query == cache_key).first()
        if existing:
            age = datetime.now(timezone.utc) - existing.cached_at.replace(
                tzinfo=timezone.utc
            )
            if age < timedelta(hours=existing.ttl_hours):
                return json.loads(existing.result_json)

    # --- Cache miss: fetch from Google Trends ---
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _fetch_sync, topic, timeframe, geo)
    except RuntimeError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Trends fetch failed: {str(e)}"
        )

    if not result:
        raise HTTPException(
            status_code=404, detail="No trends data returned for the given topic."
        )

    # --- Store in cache ---
    if db is not None:
        # Delete stale entries for the same key before inserting
        db.query(TrendCache).filter(TrendCache.query == cache_key).delete()

        cache_entry = TrendCache(
            query=cache_key,
            timeframe=timeframe,
            geo=geo,
            result_json=json.dumps(result),
            cached_at=datetime.now(timezone.utc),
            ttl_hours=24,
        )
        db.add(cache_entry)
        db.commit()

    return result
