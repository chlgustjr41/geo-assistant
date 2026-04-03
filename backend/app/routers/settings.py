from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..config import (
    get_openai_key,
    get_google_key,
    get_anthropic_key,
    get_default_model,
    get_default_rule_set,
    update_env,
    reload_env,
    _key_is_configured,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_settings():
    reload_env()  # pick up any changes to .env without requiring a backend restart
    return {
        "openai_key_set": _key_is_configured(get_openai_key()),
        "google_key_set": _key_is_configured(get_google_key()),
        "anthropic_key_set": _key_is_configured(get_anthropic_key()),
        "default_model": get_default_model(),
        "default_rule_set": get_default_rule_set(),
    }


class DefaultsUpdate(BaseModel):
    default_model: str | None = None
    default_rule_set: str | None = None


@router.put("/defaults")
async def update_defaults(body: DefaultsUpdate):
    if body.default_model is not None:
        update_env("DEFAULT_MODEL", body.default_model)
    if body.default_rule_set is not None:
        update_env("DEFAULT_RULE_SET", body.default_rule_set)
    return {"ok": True}


@router.post("/reset-workspace")
def reset_workspace(db: Session = Depends(get_db)):
    """Clear caches and orphaned data only. Preserves all saved query sets,
    corpus sets, corpus documents, rule sets, article history, and settings.
    Removes: competitor doc cache, orphaned corpus documents (no corpus_set_id)."""
    from ..models import CompetitorDoc, CorpusDocument

    deleted_cache = db.query(CompetitorDoc).delete(synchronize_session=False)
    deleted_orphans = db.query(CorpusDocument).filter(
        CorpusDocument.corpus_set_id.is_(None)
    ).delete(synchronize_session=False)
    db.commit()

    return {"ok": True, "cache_cleared": deleted_cache, "orphans_removed": deleted_orphans}


@router.post("/reset-rules-corpus")
def reset_rules_corpus(db: Session = Depends(get_db)):
    """Destructive reset: delete all query sets, corpus sets, corpus documents,
    non-builtin rule sets, and competitor cache. Preserves article history and settings."""
    from ..models import CompetitorDoc, QuerySet, CorpusDocument, CorpusSet, RuleSet

    db.query(CompetitorDoc).delete(synchronize_session=False)
    db.query(CorpusDocument).delete(synchronize_session=False)
    db.query(CorpusSet).delete(synchronize_session=False)
    db.query(QuerySet).delete(synchronize_session=False)
    db.query(RuleSet).filter(RuleSet.is_builtin == False).delete(synchronize_session=False)
    db.commit()

    remaining_rules = db.query(RuleSet).count()
    return {"ok": True, "builtin_rules_kept": remaining_rules}
