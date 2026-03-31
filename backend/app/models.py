import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class RuleSet(Base):
    __tablename__ = "rule_sets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    engine_model: Mapped[str] = mapped_column(String, nullable=False)
    topic_domain: Mapped[str] = mapped_column(String, default="healthcare")
    rules_json: Mapped[str] = mapped_column(Text, nullable=False)  # {"filtered_rules": [...]}
    num_rules: Mapped[int] = mapped_column(Integer, default=0)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(String, default="")
    original_content: Mapped[str] = mapped_column(Text, nullable=False)
    rewritten_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    geo_scores_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_set_id: Mapped[str] = mapped_column(String, default="")
    model_used: Mapped[str] = mapped_column(String, default="")
    trend_keywords_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class CompetitorDoc(Base):
    __tablename__ = "competitor_docs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    query: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String, default="synthetic")  # "scraped" | "synthetic"
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class TrendCache(Base):
    __tablename__ = "trend_cache"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    query: Mapped[str] = mapped_column(String, nullable=False)
    timeframe: Mapped[str] = mapped_column(String, nullable=False)
    geo: Mapped[str] = mapped_column(String, nullable=False)
    result_json: Mapped[str] = mapped_column(Text, nullable=False)
    cached_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    ttl_hours: Mapped[int] = mapped_column(Integer, default=24)
