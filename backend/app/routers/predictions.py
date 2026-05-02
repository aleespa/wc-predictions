from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone
from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas

router = APIRouter(prefix="/api/predictions", tags=["predictions"])


@router.post("", response_model=schemas.PredictionOut)
def submit_prediction(
    data: schemas.PredictionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify match exists
    match = db.query(models.Match).filter(models.Match.id == data.match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # Check if match has already started
    now = datetime.now(timezone.utc)
    match_date = match.match_date.replace(tzinfo=timezone.utc) if match.match_date.tzinfo is None else match.match_date
    if match_date <= now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot predict after match has started",
        )

    if match.is_finished:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Match is already finished",
        )

    # For knockout matches, ensure we have teams (either official or speculative)
    p_home_id = data.predicted_home_team_id or match.home_team_id
    p_away_id = data.predicted_away_team_id or match.away_team_id

    if match.stage != "Group Stage" and (not p_home_id or not p_away_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot predict yet — teams for this knockout match are not determined",
        )

    # Check for existing prediction (upsert)
    existing = (
        db.query(models.Prediction)
        .filter(
            models.Prediction.user_id == current_user.id,
            models.Prediction.match_id == data.match_id,
        )
        .first()
    )

    if existing:
        existing.predicted_home_score = data.predicted_home_score
        existing.predicted_away_score = data.predicted_away_score
        existing.updated_at = datetime.now(timezone.utc)
        existing.predicted_home_team_id = p_home_id
        existing.predicted_away_team_id = p_away_id
        existing.penalty_winner_id = data.penalty_winner_id
        db.commit()
        db.refresh(existing)
        return existing
    else:
        prediction = models.Prediction(
            user_id=current_user.id,
            match_id=data.match_id,
            predicted_home_score=data.predicted_home_score,
            predicted_away_score=data.predicted_away_score,
            predicted_home_team_id=p_home_id,
            predicted_away_team_id=p_away_id,
            penalty_winner_id=data.penalty_winner_id,
        )
        db.add(prediction)
        db.commit()
        db.refresh(prediction)
        return prediction


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
