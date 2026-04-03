"""Startup DB maintenance: remove legacy built-in rule sets and migrate deprecated model IDs."""
from __future__ import annotations
from sqlalchemy.orm import sessionmaker
from .models import RuleSet

_DEPRECATED_ENGINE_MODELS: dict[str, str] = {
    "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
    "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
}


def seed_rule_sets(session_factory: sessionmaker | None = None) -> None:
    if session_factory is None:
        from .database import SessionLocal
        session_factory = SessionLocal
    db = session_factory()
    try:
        db.query(RuleSet).filter(RuleSet.is_builtin == True).delete()
        db.commit()

        for old_id, new_id in _DEPRECATED_ENGINE_MODELS.items():
            db.query(RuleSet).filter(RuleSet.engine_model == old_id).update(
                {"engine_model": new_id}
            )
        db.commit()
    finally:
        db.close()
