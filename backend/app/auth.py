from typing import Optional
import time
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from .database import get_db
from . import models
import os
import httpx
from jose import jwt
from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions, AuthStatus

secret_key = os.environ.get("CLERK_SECRET_KEY")
clerk_client = Clerk(bearer_auth=secret_key)

# JWKS Cache
_jwks_cache = None
_jwks_last_fetch = 0
JWKS_TTL = 3600 # 1 hour

def get_jwks():
    global _jwks_cache, _jwks_last_fetch
    now = time.time()
    if _jwks_cache is None or (now - _jwks_last_fetch) > JWKS_TTL:
        try:
            # We use the secret key to fetch the JWKS from Clerk
            headers = {"Authorization": f"Bearer {secret_key}"}
            resp = httpx.get("https://api.clerk.com/v1/jwks", headers=headers)
            resp.raise_for_status()
            _jwks_cache = resp.json()
            _jwks_last_fetch = now
            print("DEBUG: Fetched new JWKS from Clerk")
        except Exception as e:
            print(f"ERROR: Failed to fetch JWKS: {e}")
            if _jwks_cache: return _jwks_cache # Return stale if fetch fails
            raise
    return _jwks_cache

def verify_token(token: str):
    """Manually verify Clerk JWT using cached JWKS."""
    try:
        jwks = get_jwks()
        # The jose library handles finding the right key from the JWKS
        payload = jwt.decode(
            token, 
            jwks, 
            algorithms=["RS256"],
            options={"verify_aud": False} # Clerk tokens usually don't need aud check here
        )
        return payload
    except Exception as e:
        print(f"DEBUG: Manual token verification failed: {e}")
        return None

def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise credentials_exception
        
    token = auth_header.split(" ")[1]
    payload = verify_token(token)
    
    if not payload:
        raise credentials_exception
        
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.clerk_id == user_id_str).first()
    
    # Auto-create user if they don't exist
    if user is None:
        is_admin = False
        display_name = None
        clerk_username = None
        try:
            clerk_user = clerk_client.users.get(user_id=user_id_str)
            user_emails = [e.email_address.lower() for e in clerk_user.email_addresses]
            clerk_username = clerk_user.username
            
            admin_emails_env = os.environ.get("ADMIN_EMAILS", "")
            admin_emails = [e.strip().lower() for e in admin_emails_env.split(",") if e.strip()]
            
            if any(e in admin_emails for e in user_emails):
                is_admin = True

            # Get display name from Clerk
            if clerk_user.first_name and clerk_user.last_name:
                display_name = f"{clerk_user.first_name} {clerk_user.last_name}"
            elif clerk_user.first_name:
                display_name = clerk_user.first_name
            elif clerk_user.username:
                display_name = clerk_user.username
            elif user_emails:
                display_name = user_emails[0].split('@')[0]
        except Exception as e:
            print(f"DEBUG: Failed to fetch clerk user details: {str(e)}")

        # If Clerk didn't provide a username, use a fallback
        final_username = clerk_username or f"user_{user_id_str[-6:]}"

        user = models.User(
            clerk_id=user_id_str,
            username=final_username, 
            display_name=display_name,
            is_admin=is_admin
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
    return user


def get_current_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[models.User]:
    """Returns user if authenticated, None otherwise."""
    try:
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None
            
        token = auth_header.split(" ")[1]
        payload = verify_token(token)
        
        if not payload or not payload.get("sub"):
            return None
            
        user_id_str = payload.get("sub")
        return db.query(models.User).filter(models.User.clerk_id == user_id_str).first()
    except Exception:
        return None
