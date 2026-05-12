from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from .. import models, schemas, auth as from_auth

router = APIRouter(prefix="/api", tags=["users"])

@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(from_auth.get_current_user), db: Session = Depends(get_db)):
    from ..cache import user_cache
    
    # Try cache
    cache_key = "user_profile_stats"
    cached = user_cache.get(current_user.id, cache_key)
    if cached:
        return schemas.UserOut(
            id=current_user.id,
            username=current_user.username,
            email=current_user.email,
            is_admin=current_user.is_admin,
            created_at=current_user.created_at,
            **cached
        )

    # Combined query for user stats
    stats = (
        db.query(
            func.coalesce(func.sum(models.Prediction.points_awarded), 0),
            func.count(models.Prediction.id)
        )
        .filter(models.Prediction.user_id == current_user.id)
        .first()
    )
    total_points, predictions_count = stats if stats else (0, 0)
    has_ko = db.query(models.Prediction).join(models.Match).filter(
        models.Prediction.user_id == current_user.id,
        models.Match.stage != "Group Stage"
    ).first() is not None
    
    res_data = {
        "total_points": total_points,
        "predictions_count": predictions_count,
        "has_knockout_predictions": has_ko
    }
    user_cache.set(current_user.id, cache_key, res_data)
    
    return schemas.UserOut(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        **res_data
    )


@router.put("/me", response_model=schemas.UserOut)
def update_me(
    data: schemas.UserUpdate,
    current_user: models.User = Depends(from_auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Currently no fields in UserUpdate are used since username is locked
    pass

    db.commit()
    db.refresh(current_user)
    
    # Return same as get_me but simpler for now
    return schemas.UserOut(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        total_points=0,
        predictions_count=0,
        has_knockout_predictions=False
    )
@router.delete("/me")
def delete_me(
    current_user: models.User = Depends(from_auth.get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # 1. Delete communities created by the user
        db.query(models.Community).filter(models.Community.creator_id == current_user.id).delete()
        
        # 2. Delete the user (cascades to predictions)
        db.delete(current_user)
        db.commit()
        
        return {"status": "success", "message": "Account deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")


@router.post("/users/register", response_model=schemas.UserOut)
def register_user(
    data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    user_info: dict = Depends(from_auth.get_unregistered_user_info)
):
    import os
    user_sub = user_info["sub"]
    user_email = user_info["email"]

    if not data.username:
        raise HTTPException(status_code=400, detail="ERR_USERNAME_REQUIRED")

    # Check if user already exists
    existing_user = db.query(models.User).filter(models.User.google_sub == user_sub).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="ERR_USER_ALREADY_EXISTS")

    # Check if username is taken
    existing_name = db.query(models.User).filter(models.User.username == data.username).first()
    if existing_name:
        raise HTTPException(status_code=400, detail="ERR_USERNAME_TAKEN")

    # Admin detection (by sub or email)
    is_admin = False
    
    admin_subs_env = os.environ.get("ADMIN_GOOGLE_SUBS", "")
    admin_subs = [s.strip() for s in admin_subs_env.split(",") if s.strip()]
    if user_sub in admin_subs:
        is_admin = True
        
    admin_emails_env = os.environ.get("ADMIN_EMAILS", "")
    admin_emails = [e.strip().lower() for e in admin_emails_env.split(",") if e.strip()]
    if user_email and user_email.lower() in admin_emails:
        is_admin = True

    new_user = models.User(
        google_sub=user_sub,
        email=user_email,
        username=data.username,
        is_admin=is_admin,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return schemas.UserOut(
        id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        is_admin=new_user.is_admin,
        created_at=new_user.created_at,
        total_points=0,
        predictions_count=0,
        has_knockout_predictions=False
    )
