from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("", response_model=list[schemas.LeaderboardEntry])
def get_leaderboard(db: Session = Depends(get_db)):
    # Aggregate user stats from predictions
    results = (
        db.query(
            models.User.id,
            models.User.username,
            models.User.display_name,
            func.coalesce(func.sum(models.Prediction.points_awarded), 0).label("total_points"),
            func.count(models.Prediction.id).label("predictions_count"),
            func.sum(
                case((models.Prediction.points_awarded == 5, 1), else_=0)
            ).label("exact_scores"),
            func.sum(
                case((models.Prediction.points_awarded >= 1, 1), else_=0)
            ).label("correct_outcomes"),
        )
        .outerjoin(models.Prediction, models.User.id == models.Prediction.user_id)
        .filter(models.User.is_admin == False)  # noqa: E712
        .group_by(models.User.id, models.User.username, models.User.display_name)
        .order_by(func.coalesce(func.sum(models.Prediction.points_awarded), 0).desc())
        .all()
    )

    leaderboard = []
    for rank, row in enumerate(results, 1):
        leaderboard.append(schemas.LeaderboardEntry(
            rank=rank,
            user_id=row.id,
            username=row.username,
            display_name=row.display_name,
            total_points=row.total_points or 0,
            predictions_count=row.predictions_count or 0,
            exact_scores=row.exact_scores or 0,
            correct_outcomes=row.correct_outcomes or 0,
        ))

    return leaderboard
