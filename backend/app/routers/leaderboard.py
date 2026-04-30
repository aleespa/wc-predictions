from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


def _compute_community_points(db: Session) -> dict:
    """
    Compute the community virtual user's points by rounding average predictions
    and scoring them against actual results for all finished matches.
    """
    from .community import _compute_match_stats, _calculate_points

    finished_matches = (
        db.query(models.Match)
        .filter(models.Match.is_finished == True, models.Match.home_score.isnot(None))
        .all()
    )

    match_ids = [m.id for m in finished_matches]
    stats = _compute_match_stats(db, match_ids)

    total_points = 0
    predictions_count = 0
    exact_scores = 0
    correct_outcomes = 0

    for m in finished_matches:
        s = stats.get(m.id)
        if not s or s.get("avg_home") is None:
            continue

        pred_home = round(s["avg_home"])
        pred_away = round(s["avg_away"])

        pts = _calculate_points(pred_home, pred_away, m.home_score, m.away_score)
        total_points += pts
        predictions_count += 1
        if pts == 5:
            exact_scores += 1
        if pts >= 1:
            correct_outcomes += 1

    return {
        "total_points": total_points,
        "predictions_count": predictions_count,
        "exact_scores": exact_scores,
        "correct_outcomes": correct_outcomes,
    }


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

    entries = []
    for row in results:
        entries.append({
            "user_id": row.id,
            "username": row.username,
            "display_name": row.display_name,
            "total_points": row.total_points or 0,
            "predictions_count": row.predictions_count or 0,
            "exact_scores": row.exact_scores or 0,
            "correct_outcomes": row.correct_outcomes or 0,
            "is_community": False,
        })

    # Add community virtual user
    community = _compute_community_points(db)
    if community["predictions_count"] > 0:
        entries.append({
            "user_id": -1,
            "username": "community",
            "display_name": "👥 The Community",
            "total_points": community["total_points"],
            "predictions_count": community["predictions_count"],
            "exact_scores": community["exact_scores"],
            "correct_outcomes": community["correct_outcomes"],
            "is_community": True,
        })

    # Sort by total_points descending and assign ranks
    entries.sort(key=lambda x: x["total_points"], reverse=True)

    leaderboard = []
    for rank, entry in enumerate(entries, 1):
        leaderboard.append(schemas.LeaderboardEntry(
            rank=rank,
            **entry,
        ))

    return leaderboard

