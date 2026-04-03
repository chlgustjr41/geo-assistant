from fastapi import APIRouter
from pydantic import BaseModel
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
