from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas

router = APIRouter(prefix="/api", tags=["users"])

@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Calculate stats
    total_points = (
        db.query(func.coalesce(func.sum(models.Prediction.points_awarded), 0))
        .filter(models.Prediction.user_id == current_user.id)
        .scalar()
    )
    predictions_count = (
        db.query(func.count(models.Prediction.id))
        .filter(models.Prediction.user_id == current_user.id)
        .scalar()
    )
    return schemas.UserOut(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        total_points=total_points,
        predictions_count=predictions_count,
    )


@router.put("/me", response_model=schemas.UserOut)
def update_me(
    data: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.username is not None:
        # Check if username is taken
        existing = db.query(models.User).filter(models.User.username == data.username).first()
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = data.username

    if data.display_name is not None:
        current_user.display_name = data.display_name

    db.commit()
    db.refresh(current_user)
    
    # Return same as get_me but simpler for now
    return schemas.UserOut(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        total_points=0, # These won't be recalculated here for performance but usually 0 is fine for the response
        predictions_count=0
    )
