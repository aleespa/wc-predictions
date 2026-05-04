import time
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone
from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas

router = APIRouter(prefix="/api/predictions", tags=["predictions"])
logger = logging.getLogger("app.predictions")


@router.post("", response_model=schemas.PredictionOut)
def submit_prediction(
    data: schemas.PredictionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    start_total = time.time()
    
    # Verify match exists
    t0 = time.time()
    match = db.query(models.Match).filter(models.Match.id == data.match_id).first()
    logger.debug(f"Match query took: {time.time() - t0:.4f}s")
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

    # Enforce Group Stage Lock
    if match.stage == "Group Stage" and current_user.is_group_stage_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Group stage predictions are locked because you have already started your knockout bracket."
        )

    # Enforce Knockout Gating
    if match.stage != "Group Stage" and not current_user.is_group_stage_locked:
        t4 = time.time()
        # Efficiently check if any group matches are NOT finished
        unfinished_exists = db.query(models.Match).filter(
            models.Match.stage == "Group Stage", 
            models.Match.is_finished == False
        ).first() is not None
        
        if unfinished_exists:
            # If not all finished, check if user has predicted all
            group_matches_count = db.query(models.Match).filter(models.Match.stage == "Group Stage").count()
            user_preds_count = (
                db.query(models.Prediction)
                .join(models.Match)
                .filter(
                    models.Prediction.user_id == current_user.id,
                    models.Match.stage == "Group Stage"
                )
                .count()
            )
            
            if user_preds_count < group_matches_count:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You must complete all group-stage predictions to unlock the knockout bracket."
                )
        logger.debug(f"Optimized knockout gating checks took: {time.time() - t4:.4f}s")

    # For knockout matches, ensure we have teams (either official or speculative)
    p_home_id = data.predicted_home_team_id or match.home_team_id
    p_away_id = data.predicted_away_team_id or match.away_team_id

    if match.stage != "Group Stage" and (not p_home_id or not p_away_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot predict yet — teams for this knockout match are not determined",
        )

    # Check for existing prediction (upsert)
    t5 = time.time()
    existing = (
        db.query(models.Prediction)
        .filter(
            models.Prediction.user_id == current_user.id,
            models.Prediction.match_id == data.match_id,
        )
        .first()
    )
    logger.debug(f"Existing prediction query took: {time.time() - t5:.4f}s")

    if existing:
        existing.predicted_home_score = data.predicted_home_score
        existing.predicted_away_score = data.predicted_away_score
        existing.updated_at = datetime.now(timezone.utc)
        existing.predicted_home_team_id = p_home_id
        existing.predicted_away_team_id = p_away_id
        existing.penalty_winner_id = data.penalty_winner_id
        
        # Lock group stage if this is a knockout match
        if match.stage != "Group Stage" and not current_user.is_group_stage_locked:
            current_user.is_group_stage_locked = True

        t6 = time.time()
        db.commit()
        db.refresh(existing)
        logger.debug(f"Commit/Refresh took: {time.time() - t6:.4f}s")
        logger.info(f"Prediction updated for user {current_user.id}, match {data.match_id}. Total logic time: {time.time() - start_total:.4f}s")
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
        
        # Lock group stage if this is a knockout match
        if match.stage != "Group Stage" and not current_user.is_group_stage_locked:
            current_user.is_group_stage_locked = True
            
        t6 = time.time()
        db.commit()
        db.refresh(prediction)
        logger.debug(f"Commit/Refresh took: {time.time() - t6:.4f}s")
        logger.info(f"Prediction created for user {current_user.id}, match {data.match_id}. Total logic time: {time.time() - start_total:.4f}s")
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
