"""Shared FastAPI dependencies that combine auth + database."""

from fastapi import Depends, Request
from sqlalchemy.orm import Session
from typing import Generator

from .auth import get_current_user
from .database import get_user_session_factory


async def get_user_db(
    user: dict | None = Depends(get_current_user),
) -> Generator:
    """Yields a DB session scoped to the authenticated user.

    When auth is disabled (user is None), returns a shared DB session.
    """
    email = (user.get("email") or "").lower() if user else None
    factory = get_user_session_factory(email)
    db = factory()
    try:
        yield db
    finally:
        db.close()


def get_user_email(user: dict | None = Depends(get_current_user)) -> str | None:
    """Extract the user email from auth context."""
    if user is None:
        return None
    return (user.get("email") or "").lower()
