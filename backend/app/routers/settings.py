from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, SecretStr
from ..config import (
    get_openai_key,
    get_google_key,
    get_anthropic_key,
    get_target_website,
    get_default_model,
    get_default_rule_set,
    update_env,
    _key_is_configured,
)
from ..services.llm_client import test_key as _test_key

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Minimum realistic length for any API key
_MIN_KEY_LEN = 20

# Known key prefixes for basic format validation
_KEY_PREFIXES: dict[str, tuple[str, ...]] = {
    "openai": ("sk-",),
    "google": ("AI",),
    "anthropic": ("sk-ant-",),
}


def _mask(key: str) -> str:
    """Mask a key for safe display: show first 4 and last 2 characters."""
    if not _key_is_configured(key):
        return ""
    return key[:4] + "*" * max(len(key) - 6, 4) + key[-2:]


@router.get("")
async def get_settings():
    ok = get_openai_key()
    gk = get_google_key()
    ak = get_anthropic_key()
    return {
        "openai_key_set": _key_is_configured(ok),
        "openai_key_masked": _mask(ok),
        "google_key_set": _key_is_configured(gk),
        "google_key_masked": _mask(gk),
        "anthropic_key_set": _key_is_configured(ak),
        "anthropic_key_masked": _mask(ak),
        "target_website": get_target_website(),
        "default_model": get_default_model(),
        "default_rule_set": get_default_rule_set(),
    }


class ApiKeyUpdate(BaseModel):
    provider: str
    # SecretStr prevents the key value from appearing in repr(), logs, or error tracebacks
    key: SecretStr


@router.post("/api-keys")
async def update_api_key(body: ApiKeyUpdate):
    _ENV_KEY_MAP = {
        "openai": "OPENAI_API_KEY",
        "google": "GOOGLE_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
    }
    if body.provider not in _ENV_KEY_MAP:
        raise HTTPException(400, "Invalid provider. Must be: openai, google, or anthropic.")

    raw_key = body.key.get_secret_value().strip()

    # Basic security checks — reject obviously invalid values before writing to disk
    if len(raw_key) < _MIN_KEY_LEN:
        raise HTTPException(400, f"Key is too short (minimum {_MIN_KEY_LEN} characters).")

    expected_prefixes = _KEY_PREFIXES.get(body.provider, ())
    if expected_prefixes and not any(raw_key.startswith(p) for p in expected_prefixes):
        raise HTTPException(
            400,
            f"Key does not match expected format for {body.provider}. "
            f"Expected prefix: {' or '.join(expected_prefixes)}",
        )

    update_env(_ENV_KEY_MAP[body.provider], raw_key)
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
