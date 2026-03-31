"""Seed pre-built rule sets into the database on first run."""
from __future__ import annotations
import json
from pathlib import Path
from .database import SessionLocal
from .models import RuleSet

RULE_SETS_DIR = Path(__file__).resolve().parent.parent / "data" / "rule_sets"


def seed_rule_sets() -> None:
    db = SessionLocal()
    try:
        existing = db.query(RuleSet).filter(RuleSet.is_builtin == True).count()
        if existing > 0:
            return  # Already seeded

        for json_file in sorted(RULE_SETS_DIR.glob("*.json")):
            with open(json_file) as f:
                data = json.load(f)

            rules = data.get("filtered_rules", [])
            rs = RuleSet(
                name=data["name"],
                engine_model=data["engine_model"],
                topic_domain=data.get("topic_domain", "healthcare"),
                rules_json=json.dumps({"filtered_rules": rules}),
                num_rules=len(rules),
                is_builtin=True,
            )
            db.add(rs)

        db.commit()
    finally:
        db.close()
