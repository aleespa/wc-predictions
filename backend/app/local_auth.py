"""
LOCAL-ONLY development authentication.

This module is registered **only** when the environment variable ``LOCAL_AUTH=1``
is set (see ``main.py``). It is never active in production: the production
backend (``docker-compose.prod.yml``) does not set ``LOCAL_AUTH``, and real
identity headers are injected there by the Cloudflare Pages Functions instead.

It mimics exactly what the Cloudflare proxy does in production — resolve a
session into a trusted ``X-User-Sub`` / ``X-User-Email`` header pair — but using
a trivial ``dev_user`` cookie that simply names one of two fixed local users
(``admin`` or ``test``). Because the cookie carries the identity directly there
is no session store, so it works across all uvicorn workers.

Two pieces:
  * ``DevAuthMiddleware`` — turns the ``dev_user`` cookie into the
    ``X-User-Sub`` / ``X-User-Email`` headers that ``auth.py`` already trusts.
    This means ``auth.py`` needs no changes whatsoever.
  * ``router`` — serves the ``/api/auth/*`` endpoints the SPA expects (which are
    normally provided by Cloudflare Functions): ``me``, ``login``, ``logout``.
"""

import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.exc import IntegrityError
from starlette.middleware.base import BaseHTTPMiddleware

from .database import SessionLocal
from . import models


# ---------------------------------------------------------------------------
# Fixed local users
# ---------------------------------------------------------------------------
def _admin_email() -> str:
    """Use the first configured ADMIN_EMAILS entry when present, else a default."""
    configured = [e.strip() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()]
    return configured[0] if configured else "admin@local.dev"


def _local_users() -> dict:
    return {
        "admin": {"sub": "local-admin", "email": _admin_email(), "username": "admin", "is_admin": True},
        "test": {"sub": "local-test", "email": "test@local.dev", "username": "test", "is_admin": False},
    }


DEV_COOKIE = "dev_user"


# ---------------------------------------------------------------------------
# Middleware: dev_user cookie -> X-User-Sub / X-User-Email headers
# ---------------------------------------------------------------------------
class DevAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        user = _local_users().get(request.cookies.get(DEV_COOKIE, ""))
        if user:
            # Strip any client-supplied identity headers, then inject trusted ones
            # (same trust model the Cloudflare proxy enforces in production).
            headers = [
                (k, v)
                for (k, v) in request.scope["headers"]
                if k not in (b"x-user-sub", b"x-user-email")
            ]
            headers.append((b"x-user-sub", user["sub"].encode()))
            headers.append((b"x-user-email", user["email"].encode()))
            request.scope["headers"] = headers
        return await call_next(request)


# ---------------------------------------------------------------------------
# Router: /api/auth/* endpoints (replaces Cloudflare Functions locally)
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/api/auth", tags=["local-auth"])


def _ensure_user(user: dict) -> None:
    """Ensure the local user row exists, so onboarding is skipped.

    Idempotent and tolerant of a pre-existing row left in the local DB: if the
    fixed username is already taken (e.g. by an earlier run or a seeded user),
    that row is re-mapped onto this local identity rather than failing.
    """
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.google_sub == user["sub"]).first()
        if existing is not None:
            return

        # A leftover row may already own this username under a different sub.
        by_name = db.query(models.User).filter(models.User.username == user["username"]).first()
        if by_name is not None:
            by_name.google_sub = user["sub"]
            by_name.email = user["email"]
            by_name.is_admin = user["is_admin"]
            db.commit()
            return

        db.add(
            models.User(
                google_sub=user["sub"],
                email=user["email"],
                username=user["username"],
                is_admin=user["is_admin"],
            )
        )
        db.commit()
    except IntegrityError:
        # Lost a race with a concurrent worker; the row now exists, which is fine.
        db.rollback()
    finally:
        db.close()


@router.get("/me")
def auth_me(request: Request):
    """Mirror the Cloudflare `/api/auth/me`: return the raw session identity."""
    user = _local_users().get(request.cookies.get(DEV_COOKIE, ""))
    if not user:
        return {"user": None}
    return {
        "user": {
            "sub": user["sub"],
            "email": user["email"],
            "name": user["username"],
            "picture": None,
        }
    }


@router.get("/login")
def auth_login(user: str = "test"):
    """Set the dev_user cookie for `admin` or `test`, then redirect into the app."""
    local = _local_users().get(user)
    if not local:
        return JSONResponse({"detail": "Unknown local user"}, status_code=400)

    _ensure_user(local)

    response = RedirectResponse(url="/#/", status_code=302)
    # Plain cookie (no Secure flag) so it works over http://localhost.
    response.set_cookie(
        key=DEV_COOKIE,
        value=user,
        path="/",
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
    )
    return response


@router.get("/logout")
def auth_logout():
    response = RedirectResponse(url="/#/login", status_code=302)
    response.delete_cookie(key=DEV_COOKIE, path="/")
    return response
