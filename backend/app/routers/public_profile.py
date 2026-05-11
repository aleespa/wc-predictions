"""
Public user profile endpoint — allows any visitor to see a user's predictions and stats.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case
from ..database import get_db
from .. import models, schemas
from ..cache import timed_lru_cache

router = APIRouter(prefix="/api/users", tags=["public_profile"])


class UserPublicProfile(schemas.BaseModel):
    username: str
    created_at: schemas.datetime
    total_points: int = 0
    predictions_count: int = 0
    exact_scores: int = 0
    correct_outcomes: int = 0
    accuracy: float = 0.0
    predictions: list[dict] = []


@router.get("/{username}", response_model=UserPublicProfile)
def get_user_public_profile(username: str, db: Session = Depends(get_db)):
    """
    Public endpoint — no auth required.
    Returns a user's stats and all their predictions with match details.
    Only predictions for matches that have STARTED are shown (to prevent cheating).
    """
    user = db.query(models.User).filter(
        models.User.username == username,
        models.User.is_admin == False  # noqa: E712 – don't expose admin profiles
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Load predictions with match + team data (eager)
    predictions = (
        db.query(models.Prediction)
        .filter(models.Prediction.user_id == user.id)
        .options(
            joinedload(models.Prediction.match).joinedload(models.Match.home_team),
            joinedload(models.Prediction.match).joinedload(models.Match.away_team),
        )
        .order_by(models.Prediction.match_id)
        .all()
    )

    # Compute stats
    total_points = 0
    exact_scores = 0
    correct_outcomes = 0
    finished_count = 0

    result_predictions = []
    for p in predictions:
        m = p.match
        if p.points_awarded is not None:
            total_points += p.points_awarded
            if p.points_awarded == 5:
                exact_scores += 1
            if p.points_awarded >= 1:
                correct_outcomes += 1

        if m.is_finished:
            finished_count += 1

        home_team = None
        if m.home_team:
            home_team = {
                "id": m.home_team.id,
                "name": m.home_team.name,
                "code": m.home_team.code,
                "group_letter": m.home_team.group_letter,
                "flag_emoji": m.home_team.flag_emoji,
            }

        away_team = None
        if m.away_team:
            away_team = {
                "id": m.away_team.id,
                "name": m.away_team.name,
                "code": m.away_team.code,
                "group_letter": m.away_team.group_letter,
                "flag_emoji": m.away_team.flag_emoji,
            }

        result_predictions.append({
            "prediction_id": p.id,
            "match_id": m.id,
            "match_number": m.match_number,
            "group_letter": m.group_letter,
            "stage": m.stage,
            "match_date": m.match_date if isinstance(m.match_date, str) else m.match_date.isoformat(),
            "venue": m.venue,
            "home_team": home_team,
            "away_team": away_team,
            "home_slot": m.home_slot,
            "away_slot": m.away_slot,
            "home_score": m.home_score,
            "away_score": m.away_score,
            "is_finished": m.is_finished,
            "predicted_home_score": p.predicted_home_score,
            "predicted_away_score": p.predicted_away_score,
            "points_awarded": p.points_awarded,
            "is_invalid": p.is_invalid,
        })

    accuracy = 0.0
    if finished_count > 0:
        accuracy = round((correct_outcomes / finished_count) * 100, 1)

    return UserPublicProfile(
        username=user.username,
        created_at=user.created_at,
        total_points=total_points,
        predictions_count=len(predictions),
        exact_scores=exact_scores,
        correct_outcomes=correct_outcomes,
        accuracy=accuracy,
        predictions=result_predictions,
    )
