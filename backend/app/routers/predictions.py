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


def invalidate_dependent_predictions(db: Session, user_id: int, source_match_id: int):
    """Recursively delete predictions that depend on the outcome of a changed match."""
    dependent_matches = db.query(models.Match).filter(
        (models.Match.home_source_match_id == source_match_id) |
        (models.Match.away_source_match_id == source_match_id)
    ).all()
    
    for match in dependent_matches:
        # Find and delete user prediction for this dependent match
        pred = db.query(models.Prediction).filter(
            models.Prediction.user_id == user_id,
            models.Prediction.match_id == match.id
        ).first()
        if pred:
            db.delete(pred)
            # Recursively invalidate further down the tree
            invalidate_dependent_predictions(db, user_id, match.id)

@router.post("", response_model=schemas.PredictionOut)
def submit_prediction(
    data: schemas.PredictionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 1. Fetch match
    match = get_match_cached(data.match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # 2. Check if match has already started or finished
    now = datetime.now(timezone.utc)
    match_date = match.match_date.replace(tzinfo=timezone.utc) if match.match_date.tzinfo is None else match.match_date
    if match_date <= now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot predict after match has started")
    if match.is_finished:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Match is already finished")

    # 3. Handle Gating for Knockout
    if match.stage != "Group Stage" and not current_user.is_group_stage_locked:
        group_total = get_group_count_cached()
        user_group_preds = db.query(models.Prediction).join(models.Match).filter(
            models.Prediction.user_id == current_user.id,
            models.Match.stage == "Group Stage"
        ).count()
        
        if user_group_preds < group_total:
            raise HTTPException(status_code=403, detail="Complete all group-stage predictions to unlock knockout bracket.")

    # 4. Determine teams for the prediction
    p_home_id = data.predicted_home_team_id or match.home_team_id
    p_away_id = data.predicted_away_team_id or match.away_team_id

    if match.stage != "Group Stage" and (not p_home_id or not p_away_id):
        raise HTTPException(status_code=400, detail="Teams for this knockout match are not determined")

    # 5. Check if we are updating an existing prediction
    existing = db.query(models.Prediction).filter(
        models.Prediction.user_id == current_user.id,
        models.Prediction.match_id == data.match_id
    ).first()

    # Track if the outcome might have changed (to trigger invalidation)
    outcome_changed = False
    if existing:
        # Determine current predicted winner
        def get_winner(h, a, p):
            if h > a: return "home"
            if a > h: return "away"
            return f"penalties_{p}"
        
        old_winner = get_winner(existing.predicted_home_score, existing.predicted_away_score, existing.penalty_winner_id)
        new_winner = get_winner(data.predicted_home_score, data.predicted_away_score, data.penalty_winner_id)
        
        if old_winner != new_winner:
            outcome_changed = True

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
        outcome_changed = True # New prediction always "changes" the outcome from None

    # 6. Recursive Invalidation
    if outcome_changed:
        if match.stage == "Group Stage":
            # If a group stage match changes, it ripples through the whole bracket.
            # Easiest and safest is to clear all knockout predictions.
            ko_matches = db.query(models.Match).filter(models.Match.stage != "Group Stage").all()
            ko_ids = [m.id for m in ko_matches]
            db.query(models.Prediction).filter(
                models.Prediction.user_id == current_user.id,
                models.Prediction.match_id.in_(ko_ids)
            ).delete(synchronize_session=False)
        else:
            # Knockout round change: invalidate recursively down the tree
            invalidate_dependent_predictions(db, current_user.id, match.id)

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
