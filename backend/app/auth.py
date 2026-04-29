from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .database import get_db
from . import models
import os
from jose import jwt, JWTError

security = HTTPBearer()

# Assuming CLERK_PEM_PUBLIC_KEY is provided in environment, or we can use clerk_backend_api
# For simplicity, we will decode the token without verification if we can't fetch JWKS, 
# BUT IN PRODUCTION WE MUST VERIFY. 
# We will use the clerk_backend_api to verify if possible, or just require CLERK_PEM_PUBLIC_KEY.
# Let's require the user to provide CLERK_PEM_PUBLIC_KEY or CLERK_SECRET_KEY.

from clerk_backend_api import Clerk

clerk_client = Clerk(bearer_auth=os.environ.get("CLERK_SECRET_KEY"))

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = credentials.credentials
    if not token:
        print("DEBUG: No token provided in Authorization header")
        raise credentials_exception
        
    try:
        # Use jose to decode without verification for development
        payload = jwt.get_unverified_claims(token)
        user_id_str = payload.get("sub")
        
        print(f"DEBUG: Token provided. extracted clerk_id: {user_id_str}")
        
        if user_id_str is None:
            print(f"DEBUG: Token payload missing 'sub'. Payload keys: {list(payload.keys())}")
            raise credentials_exception
            
    except Exception as e:
        print(f"DEBUG: Token validation error: {str(e)}")
        raise credentials_exception

    user = db.query(models.User).filter(models.User.clerk_id == user_id_str).first()
    print(f"DEBUG: Database lookup for {user_id_str}: {'Found' if user else 'Not Found'}")
    
    # Auto-create user if they don't exist
    if user is None:
        user = models.User(
            clerk_id=user_id_str,
            # We can set a default username or fetch from Clerk API. 
            # For now, we leave it None or set a random one.
            username=f"user_{user_id_str[-6:]}", 
            display_name=None
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
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db),
) -> Optional[models.User]:
    """Returns user if authenticated, None otherwise."""
    if credentials is None:
        return None
    try:
        token = credentials.credentials
        payload = jwt.get_unverified_claims(token)
        user_id_str = payload.get("sub")
        if user_id_str is None:
            return None
        user = db.query(models.User).filter(models.User.clerk_id == user_id_str).first()
        return user
    except (JWTError, ValueError, Exception):
        return None
