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
    extraction_metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    rule_set_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list of all selected rule set IDs
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


class QuerySet(Base):
    """A named set of search queries generated from a topic domain."""
    __tablename__ = "query_sets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    topic: Mapped[str] = mapped_column(String, default="")
    queries_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    num_queries: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class CorpusSet(Base):
    """A named group of corpus documents built from one build session."""
    __tablename__ = "corpus_sets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    query_set_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class ActiveJob(Base):
    """Persistent flag for long-running jobs that must survive sign-out/refresh."""
    __tablename__ = "active_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    job_type: Mapped[str] = mapped_column(String, nullable=False)  # "extraction", "rewrite", "geo_evaluation"
    job_id: Mapped[str] = mapped_column(String, nullable=False)     # in-memory job_manager ID
    config_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # request params for display
    status: Mapped[str] = mapped_column(String, default="running")  # running, complete, error, stale
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class CorpusDocument(Base):
    __tablename__ = "corpus_documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String, default="")
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    query_set_id: Mapped[str | None] = mapped_column(String, nullable=True)
    corpus_set_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


