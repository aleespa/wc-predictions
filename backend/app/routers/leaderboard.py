from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
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
    from ..utils import calculate_points_detail

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

        pts, is_exact, is_correct = calculate_points_detail(
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
        if is_exact:
            exact_scores += 1
        if is_correct:
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
        # We can't easily use calculate_points_detail in a single SQL query
        # But we know points_awarded matches pts_exact only if it was an exact score
        # Since pts_exact is stage-dependent, we'll do it in Python or a more complex SQL
        # Given the current structure, let's fetch predictions and compute in Python for accuracy, 
        # or use a JOIN with a points reference if it existed.
        # Alternatively, we can use the fact that points_awarded is already calculated.
        # But we need to know what pts_exact was for that match.
        
        # Let's try to do it by joining with Match to get the stage
        from ..utils import get_stage_points
        
        # This is getting complex for a simple leaderboard. 
        # Better approach: when setting the result, we could have stored is_exact in the Prediction model.
        # But we don't have that column.
        
        # Let's keep the SQL for performance but make it correct-ish by using a CASE with stage points.
        # Or just fetch all and process. For 100s of users it's fine.
        
        # For now, let's just fetch everything.
        users = (
            db.query(models.User)
            .options(joinedload(models.User.predictions).joinedload(models.Prediction.match))
            .filter(models.User.is_admin == False)
        )
        if community_id is not None:
             users = users.join(models.user_community, models.User.id == models.user_community.c.user_id)\
                          .filter(models.user_community.c.community_id == community_id)
        
        results = users.all()
        
        entries = []
        for u in results:
            total_pts = 0
            count = 0
            exact = 0
            correct = 0
            for p in u.predictions:
                if p.points_awarded is not None:
                    total_pts += p.points_awarded
                    count += 1
                    pts_exact, pts_gd, pts_outcome = get_stage_points(p.match.stage)
                    if p.points_awarded == pts_exact:
                        exact += 1
                    if p.points_awarded > 0:
                        correct += 1
            
            entries.append({
                "user_id": u.id,
                "username": u.username,
                "total_points": total_pts,
                "predictions_count": count,
                "exact_scores": exact,
                "correct_outcomes": correct,
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

