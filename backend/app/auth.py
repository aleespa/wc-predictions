"""
Backend authentication module — Google OAuth via Cloudflare KV sessions.

The Cloudflare Pages Function proxy (`functions/api/[[catchall]].js`) resolves
the browser's session cookie to a Google `sub` identifier via KV, then forwards
the request to this backend with a trusted `X-User-Sub` header.

This backend trusts that header because it is set by the Cloudflare layer; the
browser never sends it directly (CORS + Cloudflare strip it).
"""

from typing import Optional
import time
import os
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from .database import get_db
from . import models


# ---------------------------------------------------------------------------
# User data cache (google_sub -> user_dict)
# ---------------------------------------------------------------------------
_user_data_cache: dict = {}
USER_CACHE_TTL = 3600  # seconds


def _cached_user(user_id_str: str) -> Optional[models.User]:
    now = time.time()
    cached = _user_data_cache.get(user_id_str)
    if cached and (now - cached["time"]) < USER_CACHE_TTL:
        return models.User(**cached["data"])
    return None


def _cache_user(user: models.User) -> None:
    _user_data_cache[user.clerk_id] = {
        "time": time.time(),
        "data": {
            "id": user.id,
            "clerk_id": user.clerk_id,   # stores Google `sub` value
            "username": user.username,
            "is_admin": user.is_admin,
            "is_group_stage_locked": user.is_group_stage_locked,
            "created_at": user.created_at,
        },
    }


# ---------------------------------------------------------------------------
# Dependency: current authenticated user
# ---------------------------------------------------------------------------
def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    # The Cloudflare proxy injects this header after verifying the session cookie.
    user_sub = request.headers.get("X-User-Sub")
    if not user_sub:
        raise credentials_exception

    # Try in-process cache first
    cached = _cached_user(user_sub)
    if cached and request.method == "GET":
        return cached

    # Fetch from DB (clerk_id column now stores the Google sub)
    user = db.query(models.User).filter(models.User.clerk_id == user_sub).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not registered",
        )

    _cache_user(user)
    return user


def get_unregistered_sub(request: Request) -> str:
    """Returns the Google sub from headers even if the user is not in the DB."""
    user_sub = request.headers.get("X-User-Sub")
    if not user_sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    return user_sub


def get_current_admin(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[models.User]:
    """Returns the authenticated user or None for public routes."""
    user_sub = request.headers.get("X-User-Sub")
    if not user_sub:
        return None

    cached = _cached_user(user_sub)
    if cached:
        return cached

    user = db.query(models.User).filter(models.User.clerk_id == user_sub).first()
    if user:
        _cache_user(user)
    return user
