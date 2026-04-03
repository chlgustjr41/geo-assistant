from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import require_admin, SUPER_ADMIN_EMAIL
from ..config import get_allowed_emails, update_env, reload_env

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _save_whitelist(emails: list[str]) -> None:
    """Persist the whitelist to .env, always including the super-admin."""
    unique = list(dict.fromkeys(emails))  # deduplicate, preserve order
    if SUPER_ADMIN_EMAIL not in unique:
        unique.insert(0, SUPER_ADMIN_EMAIL)
    update_env("ALLOWED_EMAILS", ",".join(unique))


@router.get("/whitelist", dependencies=[Depends(require_admin)])
async def list_whitelist():
    reload_env()
    emails = get_allowed_emails()
    return {
        "emails": emails,
        "super_admin": SUPER_ADMIN_EMAIL,
    }


class AddEmailBody(BaseModel):
    email: str


@router.post("/whitelist", dependencies=[Depends(require_admin)])
async def add_to_whitelist(body: AddEmailBody):
    reload_env()
    email = body.email.strip().lower()
    if not email or "@" not in email:
        return {"ok": False, "error": "Invalid email"}
    current = get_allowed_emails()
    if email in current:
        return {"ok": True, "already_exists": True, "emails": current}
    current.append(email)
    _save_whitelist(current)
    return {"ok": True, "emails": current}


class RemoveEmailBody(BaseModel):
    email: str


@router.delete("/whitelist", dependencies=[Depends(require_admin)])
async def remove_from_whitelist(body: RemoveEmailBody):
    reload_env()
    email = body.email.strip().lower()
    if email == SUPER_ADMIN_EMAIL:
        return {"ok": False, "error": "Cannot remove the super-admin account"}
    current = get_allowed_emails()
    if email not in current:
        return {"ok": False, "error": "Email not in whitelist"}
    current.remove(email)
    _save_whitelist(current)
    return {"ok": True, "emails": current}
