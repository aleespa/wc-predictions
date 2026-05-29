from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from ..database import get_db
from .. import models, schemas
from ..cache import timed_lru_cache
from typing import Optional

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


def _compute_community_points(db: Session, community_id: Optional[int] = None) -> dict:
    """
    Compute the community virtual user's points by rounding average predictions
    and scoring them against actual results for all finished matches.
    """
    from .community import _compute_match_stats
    from ..utils import calculate_points

    finished_matches = (
        db.query(models.Match)
        .filter(models.Match.is_finished == True, models.Match.home_score.isnot(None))
        .all()
    )

    match_ids = [m.id for m in finished_matches]
    stats = _compute_match_stats(db, match_ids, community_id)

    total_points = 0
    predictions_count = 0
    exact_scores = 0
    correct_outcomes = 0

    for m in finished_matches:
        s = stats.get(m.id)
        if not s or s.get("avg_home") is None:
            continue

        # Round to get community prediction
        pred_home = round(s["avg_home"])
        pred_away = round(s["avg_away"])
        
        # Determine predicted penalty winner if draw
        pred_pen_winner = None
        if pred_home == pred_away:
            # Simple heuristic: team with higher win %
            if s.get("home_win_pct", 0) >= s.get("away_win_pct", 0):
                pred_pen_winner = m.home_team_id
            else:
                pred_pen_winner = m.away_team_id

        pts = calculate_points(
            pred_home,
            pred_away,
            m.home_score,
            m.away_score,
            predicted_pen_winner=pred_pen_winner,
            actual_pen_winner=m.penalty_winner_id,
            home_team_id=m.home_team_id,
            away_team_id=m.away_team_id,
            stage=m.stage,
        )
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



@timed_lru_cache(seconds=60)
def _get_cached_leaderboard(community_id: Optional[int] = None):
    # This function will be called by the route
    # We use a fresh DB session inside if needed, or pass one
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        # Aggregate user stats from predictions
        query = (
            db.query(
                models.User.id,
                models.User.username,
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
        )

        if community_id is not None:
            query = query.join(models.user_community, models.User.id == models.user_community.c.user_id)\
                         .filter(models.user_community.c.community_id == community_id)

        results = (
            query.group_by(models.User.id, models.User.username)
            .order_by(func.coalesce(func.sum(models.Prediction.points_awarded), 0).desc())
            .all()
        )

        entries = []
        for row in results:
            entries.append({
                "user_id": row.id,
                "username": row.username,
                "total_points": row.total_points or 0,
                "predictions_count": row.predictions_count or 0,
                "exact_scores": row.exact_scores or 0,
                "correct_outcomes": row.correct_outcomes or 0,
                "is_community": False,
            })

        # Add community virtual user
        community_stats = _compute_community_points(db, community_id)
        if community_stats["predictions_count"] > 0:
            entries.append({
                "user_id": -1,
                "username": "👥 The Community",
                "total_points": community_stats["total_points"],
                "predictions_count": community_stats["predictions_count"],
                "exact_scores": community_stats["exact_scores"],
                "correct_outcomes": community_stats["correct_outcomes"],
                "is_community": True,
            })

        # Sort by total_points descending and assign ranks
        entries.sort(key=lambda x: x["total_points"], reverse=True)

        leaderboard_data = []
        for rank, entry in enumerate(entries, 1):
            leaderboard_data.append({
                "rank": rank,
                **entry,
            })

        return leaderboard_data
    finally:
        db.close()

@router.get("", response_model=list[schemas.LeaderboardEntry])
def get_leaderboard(community_id: Optional[int] = None, db: Session = Depends(get_db)):
    # Use cached function
    return _get_cached_leaderboard(community_id)

