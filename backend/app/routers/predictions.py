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
    # Determine if bracket is unlocked: only when all group stage matches are finished
    group_matches = db.query(models.Match).filter(models.Match.stage == "Group Stage").all()
    all_finished = all(m.is_finished for m in group_matches)
    return all_finished


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
    match_dt = match.match_date
    if isinstance(match_dt, str):
        match_dt = datetime.fromisoformat(match_dt)
    if match_dt.tzinfo is None:
        match_dt = match_dt.replace(tzinfo=timezone.utc)
    
    # Disallow prediction for knockout matches until the admin has officially
    # confirmed the group standings (the read-only overlay unlock state).
    if match.stage != "Group Stage":
        from ..confirmed_standings import is_bracket_unlocked
        if not is_bracket_unlocked():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Matches are locked until admin confirms group standings.")
        # Ensure source matches (if any) are finished
        src_ids = [match.home_source_match_id, match.away_source_match_id]
        if any(src_ids):
            src_matches = (
                db.query(models.Match)
                .filter(models.Match.id.in_([i for i in src_ids if i]))
                .all()
            )
            if not all(sm.is_finished for sm in src_matches):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Match is not yet confirmed for prediction")
    # Group stage matches are always allowed (subject to start time checks)


    if match_dt <= now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot predict after match has started")
    if match.is_finished:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Match is already finished")

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
        existing.updated_at = datetime.now(timezone.utc).isoformat()
        existing.predicted_home_team_id = p_home_id
        existing.predicted_away_team_id = p_away_id
        existing.penalty_winner_id = data.penalty_winner_id
        existing.is_invalid = False
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

    # 6. Run unified bracket invalidation pass for the user
    if outcome_changed:
        from .knockout import invalidate_single_user_bracket
        invalidate_single_user_bracket(db, current_user.id)

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
