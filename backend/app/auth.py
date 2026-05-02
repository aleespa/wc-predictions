from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from .database import get_db
from . import models
import os
from clerk_backend_api import Clerk
from clerk_backend_api.security import authenticate_request
from clerk_backend_api.security.types import AuthenticateRequestOptions, AuthStatus

secret_key = os.environ.get("CLERK_SECRET_KEY")
clerk_client = Clerk(bearer_auth=secret_key)
auth_options = AuthenticateRequestOptions(secret_key=secret_key)

def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        request_state = authenticate_request(request, auth_options)
        if request_state.status != AuthStatus.SIGNED_IN or not request_state.payload:
            print(f"DEBUG: Token validation failed: status={request_state.status}")
            raise credentials_exception
            
        user_id_str = request_state.payload.get("sub")
        if not user_id_str:
            raise credentials_exception
            
    except Exception as e:
        print(f"DEBUG: Token validation error: {str(e)}")
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
        request_state = authenticate_request(request, auth_options)
        if request_state.status != AuthStatus.SIGNED_IN or not request_state.payload:
            return None
            
        user_id_str = request_state.payload.get("sub")
        if not user_id_str:
            return None
            
        user = db.query(models.User).filter(models.User.clerk_id == user_id_str).first()
        return user
    except Exception:
        return None
