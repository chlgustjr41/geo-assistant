"""Firebase Authentication dependency for FastAPI.

Verifies Firebase ID tokens from the frontend and checks the user's email
against a whitelist stored in ALLOWED_EMAILS (comma-separated in .env).
"""

import os
from fastapi import Depends, HTTPException, Header
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

from .config import get_firebase_service_account_path, get_allowed_emails, reload_env

_firebase_app = None


def _ensure_firebase() -> None:
    """Initialise Firebase Admin SDK once (lazy)."""
    global _firebase_app
    if _firebase_app is not None:
        return
    sa_path = get_firebase_service_account_path()
    if sa_path and os.path.isfile(sa_path):
        cred = credentials.Certificate(sa_path)
        _firebase_app = firebase_admin.initialize_app(cred)
    else:
        # Fall back to Application Default Credentials (e.g. on GCP)
        _firebase_app = firebase_admin.initialize_app()


def _auth_enabled() -> bool:
    """Auth is enabled when ALLOWED_EMAILS is configured."""
    return bool(get_allowed_emails())


async def get_current_user(authorization: str = Header(default="")) -> dict | None:
    """FastAPI dependency that verifies the Firebase ID token.

    When ALLOWED_EMAILS is empty (local dev), authentication is skipped
    entirely so the app works without Firebase setup.
    """
    reload_env()

    if not _auth_enabled():
        return None  # auth disabled — allow all requests

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty token")

    try:
        _ensure_firebase()
        decoded = firebase_auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    email = (decoded.get("email") or "").lower()
    allowed = get_allowed_emails()
    if email not in allowed:
        raise HTTPException(status_code=403, detail="Account not authorized")

    return decoded
