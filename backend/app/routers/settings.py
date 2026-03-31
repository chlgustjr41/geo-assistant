from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..config import (
    get_openai_key,
    get_google_key,
    get_anthropic_key,
    get_target_website,
    get_default_model,
    get_default_rule_set,
    update_env,
)
from ..services.llm_client import test_key as _test_key

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _mask(key: str) -> str:
    if not key or len(key) < 8:
        return ""
    return key[:4] + "*" * (len(key) - 6) + key[-2:]


@router.get("")
async def get_settings():
    return {
        "openai_key_set": bool(get_openai_key()),
        "openai_key_masked": _mask(get_openai_key()),
        "google_key_set": bool(get_google_key()),
        "google_key_masked": _mask(get_google_key()),
        "anthropic_key_set": bool(get_anthropic_key()),
        "anthropic_key_masked": _mask(get_anthropic_key()),
        "target_website": get_target_website(),
        "default_model": get_default_model(),
        "default_rule_set": get_default_rule_set(),
    }


class ApiKeyUpdate(BaseModel):
    provider: str  # "openai" | "google" | "anthropic"
    key: str


@router.post("/api-keys")
async def update_api_key(body: ApiKeyUpdate):
    key_map = {
        "openai": "OPENAI_API_KEY",
        "google": "GOOGLE_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
    }
    if body.provider not in key_map:
        raise HTTPException(400, "Invalid provider. Must be openai, google, or anthropic.")
    update_env(key_map[body.provider], body.key)
    return {"ok": True}


class TestKeyRequest(BaseModel):
    provider: str


@router.post("/test-key")
async def test_api_key(body: TestKeyRequest):
    result = await _test_key(body.provider)
    return {"ok": result}


class DefaultsUpdate(BaseModel):
    target_website: str | None = None
    default_model: str | None = None
    default_rule_set: str | None = None


@router.put("/defaults")
async def update_defaults(body: DefaultsUpdate):
    if body.target_website is not None:
        update_env("TARGET_WEBSITE", body.target_website)
    if body.default_model is not None:
        update_env("DEFAULT_MODEL", body.default_model)
    if body.default_rule_set is not None:
        update_env("DEFAULT_RULE_SET", body.default_rule_set)
    return {"ok": True}
