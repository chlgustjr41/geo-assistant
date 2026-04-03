"""Per-user SQLite database management.

Each authenticated user gets an isolated database at:
    backend/data/users/<email_hash>/geo.db

When auth is disabled (local dev), a single shared database is used at:
    backend/data/careyaya_geo.db
"""

import hashlib
import threading
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from typing import Generator

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
USERS_DIR = DATA_DIR / "users"
USERS_DIR.mkdir(exist_ok=True)

# Shared (auth-disabled) fallback
_SHARED_DB_PATH = DATA_DIR / "careyaya_geo.db"

_lock = threading.Lock()
_engines: dict[str, tuple] = {}  # email -> (engine, SessionLocal)


class Base(DeclarativeBase):
    pass


def _email_hash(email: str) -> str:
    return hashlib.sha256(email.encode()).hexdigest()[:16]


def _ensure_user_db(email: str) -> sessionmaker:
    """Get or create engine + session factory for a user's database."""
    key = email.lower()
    with _lock:
        if key in _engines:
            return _engines[key][1]

    user_dir = USERS_DIR / _email_hash(key)
    user_dir.mkdir(exist_ok=True)
    db_path = user_dir / "geo.db"
    url = f"sqlite:///{db_path}"
    eng = create_engine(url, connect_args={"check_same_thread": False})

    # Create all tables
    Base.metadata.create_all(bind=eng)

    # Schema migrations (same as main.py startup)
    with eng.connect() as conn:
        for stmt in [
            "ALTER TABLE rule_sets ADD COLUMN extraction_metadata_json TEXT",
            "ALTER TABLE corpus_documents ADD COLUMN query_set_id VARCHAR",
            "ALTER TABLE corpus_documents ADD COLUMN corpus_set_id VARCHAR",
            "ALTER TABLE articles ADD COLUMN rule_set_ids_json TEXT",
            """CREATE TABLE IF NOT EXISTS corpus_sets (
                id VARCHAR PRIMARY KEY,
                name VARCHAR NOT NULL,
                query_set_id VARCHAR,
                created_at DATETIME
            )""",
            """CREATE TABLE IF NOT EXISTS active_jobs (
                id VARCHAR PRIMARY KEY,
                job_type VARCHAR NOT NULL,
                job_id VARCHAR NOT NULL,
                config_json TEXT,
                status VARCHAR DEFAULT 'running',
                result_json TEXT,
                error VARCHAR,
                created_at DATETIME
            )""",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass

    # Run seed for this user's DB
    from .seed import seed_rule_sets
    sl = sessionmaker(autocommit=False, autoflush=False, bind=eng)
    seed_rule_sets(sl)

    with _lock:
        _engines[key] = (eng, sl)
    return sl


def _get_shared_session_factory() -> sessionmaker:
    """Shared DB for auth-disabled (local dev) mode."""
    key = "__shared__"
    with _lock:
        if key in _engines:
            return _engines[key][1]
    url = f"sqlite:///{_SHARED_DB_PATH}"
    eng = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)

    with eng.connect() as conn:
        for stmt in [
            "ALTER TABLE rule_sets ADD COLUMN extraction_metadata_json TEXT",
            "ALTER TABLE corpus_documents ADD COLUMN query_set_id VARCHAR",
            "ALTER TABLE corpus_documents ADD COLUMN corpus_set_id VARCHAR",
            "ALTER TABLE articles ADD COLUMN rule_set_ids_json TEXT",
            """CREATE TABLE IF NOT EXISTS corpus_sets (
                id VARCHAR PRIMARY KEY,
                name VARCHAR NOT NULL,
                query_set_id VARCHAR,
                created_at DATETIME
            )""",
            """CREATE TABLE IF NOT EXISTS active_jobs (
                id VARCHAR PRIMARY KEY,
                job_type VARCHAR NOT NULL,
                job_id VARCHAR NOT NULL,
                config_json TEXT,
                status VARCHAR DEFAULT 'running',
                result_json TEXT,
                error VARCHAR,
                created_at DATETIME
            )""",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass

    from .seed import seed_rule_sets
    sl = sessionmaker(autocommit=False, autoflush=False, bind=eng)
    seed_rule_sets(sl)

    with _lock:
        _engines[key] = (eng, sl)
    return sl


# Legacy exports for startup compatibility
engine = create_engine(f"sqlite:///{_SHARED_DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_user_session_factory(user_email: str | None) -> sessionmaker:
    """Return the correct session factory based on user context."""
    if user_email:
        return _ensure_user_db(user_email)
    return _get_shared_session_factory()


def get_db() -> Generator:
    """Legacy fallback for shared DB (used at startup only)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
