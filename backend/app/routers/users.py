from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..auth import hash_password, verify_password, create_access_token, get_current_user
from .. import models, schemas

router = APIRouter(prefix="/api", tags=["users"])


@router.post("/register", response_model=schemas.Token)
def register(user_data: schemas.UserRegister, db: Session = Depends(get_db)):
    # Check if username taken
    existing = db.query(models.User).filter(models.User.username == user_data.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken",
        )

    user = models.User(
        username=user_data.username,
        hashed_password=hash_password(user_data.password),
        display_name=user_data.display_name or user_data.username,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/login", response_model=schemas.Token)
def login(user_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == user_data.username).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


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
