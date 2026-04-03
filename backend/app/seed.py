"""Startup DB maintenance: remove legacy built-in rule sets and migrate deprecated model IDs."""
from __future__ import annotations
from .database import SessionLocal
from .models import RuleSet

_DEPRECATED_ENGINE_MODELS: dict[str, str] = {
    "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
    "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
}


def seed_rule_sets() -> None:
    db = SessionLocal()
    try:
        # Remove any previously seeded built-in rule sets (no longer shipped)
        db.query(RuleSet).filter(RuleSet.is_builtin == True).delete()
        db.commit()

        # Migrate deprecated model IDs on user-created rule sets
        for old_id, new_id in _DEPRECATED_ENGINE_MODELS.items():
            db.query(RuleSet).filter(RuleSet.engine_model == old_id).update(
                {"engine_model": new_id}
            )
        db.commit()
    finally:
        db.close()
