import time
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone
from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas
from ..cache import user_cache

router = APIRouter(prefix="/api/predictions", tags=["predictions"])
logger = logging.getLogger("app.predictions")

from ..cache import timed_lru_cache

@timed_lru_cache(seconds=600)
def get_match_cached(m_id: int):
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        return db.query(models.Match).filter(models.Match.id == m_id).first()
    finally:
        db.close()

@timed_lru_cache(seconds=3600)
def get_group_count_cached():
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        return db.query(models.Match).filter(models.Match.stage == "Group Stage").count()
    finally:
        db.close()


@router.post("", response_model=schemas.PredictionOut)
def submit_prediction(
    data: schemas.PredictionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    start_total = time.time()
    
    # 1. Match and Existing Prediction in one go? 
    match = get_match_cached(data.match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # 2. Check if match has already started
    now = datetime.now(timezone.utc)
    match_date = match.match_date.replace(tzinfo=timezone.utc) if match.match_date.tzinfo is None else match.match_date
    if match_date <= now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot predict after match has started")

    if match.is_finished:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Match is already finished")

    # 3. Handle Gating and Existing Prediction in a combined query if possible
    # For now, let's just reduce the gating queries
    if match.stage != "Group Stage" and not current_user.is_group_stage_locked:
        # Check if user has predicted all group matches
        group_total = get_group_count_cached()
        user_group_preds = db.query(models.Prediction).join(models.Match).filter(
            models.Prediction.user_id == current_user.id,
            models.Match.stage == "Group Stage"
        ).count()
        
        if user_group_preds < group_total:
            raise HTTPException(status_code=403, detail="Complete all group-stage predictions to unlock knockout bracket.")

    # 4. Upsert prediction
    existing = db.query(models.Prediction).filter(
        models.Prediction.user_id == current_user.id,
        models.Prediction.match_id == data.match_id
    ).first()

    p_home_id = data.predicted_home_team_id or match.home_team_id
    p_away_id = data.predicted_away_team_id or match.away_team_id

    if match.stage != "Group Stage" and (not p_home_id or not p_away_id):
        raise HTTPException(status_code=400, detail="Teams for this knockout match are not determined")

    if existing:
        existing.predicted_home_score = data.predicted_home_score
        existing.predicted_away_score = data.predicted_away_score
        existing.updated_at = datetime.now(timezone.utc)
        existing.predicted_home_team_id = p_home_id
        existing.predicted_away_team_id = p_away_id
        existing.penalty_winner_id = data.penalty_winner_id
    else:
        existing = models.Prediction(
            user_id=current_user.id, match_id=data.match_id,
            predicted_home_score=data.predicted_home_score,
            predicted_away_score=data.predicted_away_score,
            predicted_home_team_id=p_home_id,
            predicted_away_team_id=p_away_id,
            penalty_winner_id=data.penalty_winner_id,
        )
        db.add(existing)

    if match.stage != "Group Stage":
        current_user.is_group_stage_locked = True

    db.commit()
    db.refresh(existing)
    user_cache.invalidate(current_user.id)
    return existing


@router.get("/me", response_model=list[schemas.PredictionWithMatch])
def my_predictions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    predictions = (
        db.query(models.Prediction)
        .filter(models.Prediction.user_id == current_user.id)
        .options(
            joinedload(models.Prediction.match).joinedload(models.Match.home_team),
            joinedload(models.Prediction.match).joinedload(models.Match.away_team),
        )
        .order_by(models.Prediction.created_at.desc())
        .all()
    )

    return [schemas.PredictionWithMatch.model_validate(p) for p in predictions]


@router.get("/match/{match_id}", response_model=schemas.PredictionOut)
def get_prediction_for_match(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    prediction = (
        db.query(models.Prediction)
        .filter(
            models.Prediction.user_id == current_user.id,
            models.Prediction.match_id == match_id,
        )
        .first()
    )
    if not prediction:
        raise HTTPException(status_code=404, detail="No prediction found for this match")
    return prediction
