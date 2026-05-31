"""
Community Predictions API — aggregated prediction statistics
across all users for every match, plus implied group standings
and knockout bracket progression.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case
from datetime import datetime, timezone
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user
from ..cache import timed_lru_cache
import secrets

router = APIRouter(prefix="/api/community", tags=["community"])


# ── Pydantic response models ────────────────────────

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class CommunityMatchStats(BaseModel):
    match_id: int
    group_letter: Optional[str]
    stage: str
    match_number: Optional[int]
    match_date: datetime
    venue: Optional[str]
    home_team: Optional[schemas.TeamOut] = None
    away_team: Optional[schemas.TeamOut] = None
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    penalty_winner_id: Optional[int] = None
    is_finished: bool
    home_slot: Optional[str] = None
    away_slot: Optional[str] = None
    home_source_match_id: Optional[int] = None
    away_source_match_id: Optional[int] = None

    # Community stats
    prediction_count: int = 0
    avg_home_score: Optional[float] = None
    avg_away_score: Optional[float] = None
    home_win_pct: Optional[float] = None
    draw_pct: Optional[float] = None
    away_win_pct: Optional[float] = None

    class Config:
        from_attributes = True


class MatchPredictionDetail(BaseModel):
    id: int
    username: str
    predicted_home_score: int
    predicted_away_score: int
    penalty_winner_id: Optional[int] = None
    points_awarded: Optional[int] = None

    class Config:
        from_attributes = True


class MatchPredictionsResponse(BaseModel):
    match: CommunityMatchStats
    predictions: List[MatchPredictionDetail]
    total_count: int


class CommunityBracketSlotTeam(BaseModel):
    team: Optional[schemas.TeamOut] = None
    slot_label: Optional[str] = None


class CommunityBracketMatchOut(BaseModel):
    match_id: int
    match_number: Optional[int]
    stage: str
    match_date: datetime
    venue: Optional[str]
    home: CommunityBracketSlotTeam
    away: CommunityBracketSlotTeam
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    penalty_winner_id: Optional[int] = None
    is_finished: bool = False
    home_source_match_id: Optional[int] = None
    away_source_match_id: Optional[int] = None

    # Community stats
    prediction_count: int = 0
    avg_home_score: Optional[float] = None
    avg_away_score: Optional[float] = None
    home_win_pct: Optional[float] = None
    draw_pct: Optional[float] = None
    away_win_pct: Optional[float] = None

    # Derived winner from avg score rounding
    derived_winner_team: Optional[schemas.TeamOut] = None


class CommunityBracketOut(BaseModel):
    available: bool
    round_of_32: list[CommunityBracketMatchOut] = []
    round_of_16: list[CommunityBracketMatchOut] = []
    quarter_finals: list[CommunityBracketMatchOut] = []
    semi_finals: list[CommunityBracketMatchOut] = []
    third_place: Optional[CommunityBracketMatchOut] = None
    final: Optional[CommunityBracketMatchOut] = None


# ── Helper: compute prediction stats for a set of matches ──

def _compute_match_stats(db: Session, match_ids: list[int], community_id: Optional[int] = None) -> dict:
    """
    For each match in match_ids, compute aggregate prediction statistics.
    Returns dict: match_id -> { count, avg_home, avg_away, home_win_pct, draw_pct, away_win_pct }
    """
    if not match_ids:
        return {}

    # Single aggregate query for all stats
    query = db.query(
        models.Prediction.match_id,
        func.count(models.Prediction.id).label("cnt"),
        func.avg(models.Prediction.predicted_home_score).label("avg_h"),
        func.avg(models.Prediction.predicted_away_score).label("avg_a"),
        func.sum(case((models.Prediction.predicted_home_score > models.Prediction.predicted_away_score, 1), else_=0)).label("h_wins"),
        func.sum(case((models.Prediction.predicted_home_score == models.Prediction.predicted_away_score, 1), else_=0)).label("draws"),
    ).filter(models.Prediction.match_id.in_(match_ids))

    if community_id is not None:
        query = query.join(models.User, models.Prediction.user_id == models.User.id)\
                     .join(models.user_community, models.User.id == models.user_community.c.user_id)\
                     .filter(models.user_community.c.community_id == community_id)

    rows = query.group_by(models.Prediction.match_id).all()

    stats = {}
    for row in rows:
        total = row.cnt
        if total == 0:
            continue
            
        stats[row.match_id] = {
            "count": total,
            "avg_home": round(float(row.avg_h), 1) if row.avg_h is not None else None,
            "avg_away": round(float(row.avg_a), 1) if row.avg_a is not None else None,
            "home_win_pct": round((row.h_wins or 0) / total * 100, 1),
            "draw_pct": round((row.draws or 0) / total * 100, 1),
            "away_win_pct": round((total - (row.h_wins or 0) - (row.draws or 0)) / total * 100, 1),
        }

    return stats


# ── Group stage community stats + implied standings ──

@timed_lru_cache(seconds=60)
def _get_cached_community_matches(community_id: Optional[int] = None):
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        matches = (
            db.query(models.Match)
            .options(joinedload(models.Match.home_team), joinedload(models.Match.away_team))
            .order_by(models.Match.match_date, models.Match.id)
            .all()
        )

        match_ids = [m.id for m in matches]
        stats = _compute_match_stats(db, match_ids, community_id)

        result = []
        for m in matches:
            s = stats.get(m.id, {})
            result.append({
                "match_id": m.id,
                "group_letter": m.group_letter,
                "stage": m.stage,
                "match_number": m.match_number,
                "match_date": m.match_date if isinstance(m.match_date, str) else m.match_date.isoformat(),
                "venue": m.venue,
                "home_team": schemas.TeamOut.model_validate(m.home_team).model_dump() if m.home_team else None,
                "away_team": schemas.TeamOut.model_validate(m.away_team).model_dump() if m.away_team else None,
                "home_score": m.home_score,
                "away_score": m.away_score,
                "penalty_winner_id": m.penalty_winner_id,
                "is_finished": m.is_finished,
                "home_slot": m.home_slot,
                "away_slot": m.away_slot,
                "home_source_match_id": m.home_source_match_id,
                "away_source_match_id": m.away_source_match_id,
                "prediction_count": s.get("count", 0),
                "avg_home_score": s.get("avg_home"),
                "avg_away_score": s.get("avg_away"),
                "home_win_pct": s.get("home_win_pct"),
                "draw_pct": s.get("draw_pct"),
                "away_win_pct": s.get("away_win_pct"),
            })
        return result
    finally:
        db.close()

@router.get("/match/{match_id}/predictions", response_model=MatchPredictionsResponse)
def get_match_predictions(
    match_id: int,
    community_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get individual player predictions for a specific match.
    Only returns predictions if the match has started or finished.
    """
    # 1. Fetch match and check if it exists
    match = db.query(models.Match).options(
        joinedload(models.Match.home_team),
        joinedload(models.Match.away_team)
    ).filter(models.Match.id == match_id).first()

    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # 3. Fetch match stats for the response header
    stats_dict = _compute_match_stats(db, [match_id], community_id)
    s = stats_dict.get(match_id, {})
    
    match_stats = CommunityMatchStats(
        match_id=match.id,
        group_letter=match.group_letter,
        stage=match.stage,
        match_number=match.match_number,
        match_date=match.match_date,
        venue=match.venue,
        home_team=schemas.TeamOut.model_validate(match.home_team) if match.home_team else None,
        away_team=schemas.TeamOut.model_validate(match.away_team) if match.away_team else None,
        home_score=match.home_score,
        away_score=match.away_score,
        penalty_winner_id=match.penalty_winner_id,
        is_finished=match.is_finished,
        home_slot=match.home_slot,
        away_slot=match.away_slot,
        home_source_match_id=match.home_source_match_id,
        away_source_match_id=match.away_source_match_id,
        prediction_count=s.get("count", 0),
        avg_home_score=s.get("avg_home"),
        avg_away_score=s.get("avg_away"),
        home_win_pct=s.get("home_win_pct"),
        draw_pct=s.get("draw_pct"),
        away_win_pct=s.get("away_win_pct"),
    )

    # 4. Fetch individual predictions
    query = db.query(models.Prediction).join(models.User).filter(models.Prediction.match_id == match_id)
    
    if community_id:
        query = query.join(models.user_community, models.User.id == models.user_community.c.user_id)\
                     .filter(models.user_community.c.community_id == community_id)

    total_count = query.count()
    
    predictions = query.order_by(models.Prediction.points_awarded.desc().nulls_last(), models.User.username)\
                       .offset((page - 1) * limit)\
                       .limit(limit)\
                       .all()

    prediction_details = [
        MatchPredictionDetail(
            id=p.id,
            username=p.user.username,
            predicted_home_score=p.predicted_home_score,
            predicted_away_score=p.predicted_away_score,
            penalty_winner_id=p.penalty_winner_id,
            points_awarded=p.points_awarded
        )
        for p in predictions
    ]

    # 5. Fetch all public communities to provide filter options
    # (Actually we already have the communities from the previous request in frontend, 
    # but we should ensure current_user is member or it's public if we had public communities)
    # The requirement says "specific private community they belong to"
    
    return MatchPredictionsResponse(
        match=match_stats,
        predictions=prediction_details,
        total_count=total_count
    )


@router.get("/matches", response_model=list[CommunityMatchStats])
def get_community_matches(community_id: Optional[int] = None, db: Session = Depends(get_db)):
    return _get_cached_community_matches(community_id)


@router.get("/standings/{group_letter}", response_model=list[schemas.StandingOut])
def get_community_standings(group_letter: str, community_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Compute implied group standings from the community's average predicted scores.
    Uses standard rounding of the average to derive the implied result for each match.
    """
    teams = db.query(models.Team).filter(
        models.Team.group_letter == group_letter.upper()
    ).all()
    if not teams:
        return []

    matches = (
        db.query(models.Match)
        .filter(
            models.Match.group_letter == group_letter.upper(),
            models.Match.stage == "Group Stage",
        )
        .all()
    )

    match_ids = [m.id for m in matches]
    stats = _compute_match_stats(db, match_ids, community_id)

    from ..utils import compute_standings

    def get_avg_scores(m):
        s = stats.get(m.id)
        if not s or s.get("avg_home") is None:
            return None
        return (round(s["avg_home"]), round(s["avg_away"]), True)

    return compute_standings(teams, matches, get_avg_scores)


@router.get("/thirds", response_model=list[schemas.StandingOut])
def get_community_thirds_standings(
    community_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Compute implied best third-placed teams from the community's average predicted scores.
    """
    teams = db.query(models.Team).all()
    group_matches = db.query(models.Match).filter(models.Match.stage == "Group Stage").all()

    match_ids = [m.id for m in group_matches]
    stats = _compute_match_stats(db, match_ids, community_id)

    # Map teams by ID and group
    teams_by_group = {}
    for t in teams:
        teams_by_group.setdefault(t.group_letter, []).append(t)

    matches_by_group = {}
    for m in group_matches:
        matches_by_group.setdefault(m.group_letter, []).append(m)

    from ..utils import compute_standings
    
    def get_avg_scores(m):
        s = stats.get(m.id)
        if not s or s.get("avg_home") is None:
            return None
        return (round(s["avg_home"]), round(s["avg_away"]), True)

    all_thirds = []
    for gl in "ABCDEFGHIJKL":
        group_teams = teams_by_group.get(gl, [])
        group_matches_list = matches_by_group.get(gl, [])
        standings = compute_standings(group_teams, group_matches_list, get_avg_scores)
        if len(standings) >= 3:
            all_finished = all((m.is_finished and m.home_score is not None) for m in group_matches_list if m.home_team_id and m.away_team_id)
            third = standings[2]
            third["is_predicted"] = third["is_predicted"] or (not all_finished)
            third["group_letter"] = gl
            all_thirds.append(third)

    # Sort ALL 3rd place teams by performance
    all_thirds.sort(key=lambda x: (x["points"], x["goal_diff"], x["goals_for"]), reverse=True)
    return all_thirds


# ── Community points (virtual user scoring) ──────────

class CommunityMatchPoints(BaseModel):
    match_id: int
    predicted_home: int
    predicted_away: int
    actual_home: int
    actual_away: int
    points_awarded: int


class CommunityPointsOut(BaseModel):
    total_points: int
    predictions_count: int
    exact_scores: int
    correct_outcomes: int
    match_details: list[CommunityMatchPoints] = []


from ..utils import calculate_points_detail


@router.get("/points", response_model=CommunityPointsOut)
def get_community_points(community_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Compute the community's virtual prediction points.
    For every finished match with predictions, round the community average
    scores and score them against the actual result.
    """
    matches = (
        db.query(models.Match)
        .all()
    )

    match_ids = [m.id for m in matches]
    stats = _compute_match_stats(db, match_ids, community_id)

    total_points = 0
    predictions_count = sum(1 for s in stats.values() if s.get("avg_home") is not None)
    exact_scores = 0
    correct_outcomes = 0
    match_details = []

    for m in matches:
        if not (m.is_finished and m.home_score is not None):
            continue

        s = stats.get(m.id)
        if not s or s.get("avg_home") is None:
            continue  # No predictions for this match

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

        if is_exact:
            exact_scores += 1
        if is_correct:
            correct_outcomes += 1

        match_details.append(CommunityMatchPoints(
            match_id=m.id,
            predicted_home=pred_home,
            predicted_away=pred_away,
            actual_home=m.home_score,
            actual_away=m.away_score,
            points_awarded=pts,
        ))

    return CommunityPointsOut(
        total_points=total_points,
        predictions_count=predictions_count,
        exact_scores=exact_scores,
        correct_outcomes=correct_outcomes,
        match_details=match_details,
    )


# ── Knockout bracket: community-derived progression ──

def _team_to_out(team) -> Optional[schemas.TeamOut]:
    if team is None:
        return None
    return schemas.TeamOut.model_validate(team)


def _r32_fully_defined(db: Session) -> bool:
    """Check if all R32 matches have real (confirmed) teams assigned."""
    r32_matches = (
        db.query(models.Match)
        .filter(models.Match.stage == "Round of 32")
        .all()
    )
    return all(m.home_team_id is not None and m.away_team_id is not None for m in r32_matches)


@router.get("/bracket", response_model=CommunityBracketOut)
def get_community_bracket(community_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Get the community knockout bracket, only available once all R32 matches
    have confirmed (real) teams. Propagates winners based on rounded average
    community predictions.
    """
    if not _r32_fully_defined(db):
        return CommunityBracketOut(available=False)

    # Load all knockout matches
    knockout_matches = (
        db.query(models.Match)
        .filter(models.Match.stage != "Group Stage")
        .options(
            joinedload(models.Match.home_team),
            joinedload(models.Match.away_team),
        )
        .order_by(models.Match.match_number)
        .all()
    )

    ko_match_ids = [m.id for m in knockout_matches]
    stats = _compute_match_stats(db, ko_match_ids, community_id)

    # Build maps for lookup
    match_by_id = {m.id: m for m in knockout_matches}
    match_by_num = {m.match_number: m for m in knockout_matches}

    # Resolved teams from community predictions: match_id -> winner TeamOut
    community_winners = {}

    def resolve_community_winner(match: models.Match) -> Optional[schemas.TeamOut]:
        """
        Determine the community-predicted winner of a match.
        For R32: uses real teams + community avg score.
        For R16+: recursively resolves from source matches.
        """
        if match.id in community_winners:
            return community_winners[match.id]

        # If the match has a real result, use that
        if match.is_finished and match.home_score is not None:
            if match.home_score > match.away_score:
                winner = _team_to_out(match.home_team)
            elif match.away_score > match.home_score:
                winner = _team_to_out(match.away_team)
            else:
                winner = _team_to_out(match.home_team)  # Draw — home advances by convention
            community_winners[match.id] = winner
            return winner

        # Determine who the home/away teams are for this match
        home_team = _get_community_team_for_slot(match, "home", match_by_id, match_by_num, community_winners, stats, db)
        away_team = _get_community_team_for_slot(match, "away", match_by_id, match_by_num, community_winners, stats, db)

        # Use community average score to determine winner
        s = stats.get(match.id)
        if s and s.get("avg_home") is not None and home_team and away_team:
            h_rounded = round(s["avg_home"])
            a_rounded = round(s["avg_away"])
            if h_rounded > a_rounded:
                winner = home_team
            elif a_rounded > h_rounded:
                winner = away_team
            else:
                winner = home_team  # Draw — home advances
            community_winners[match.id] = winner
            return winner

        # If no predictions, propagate None
        community_winners[match.id] = None
        return None

    def resolve_community_loser(match: models.Match) -> Optional[schemas.TeamOut]:
        """Determine the community-predicted loser of a match."""
        if match.is_finished and match.home_score is not None:
            if match.home_score > match.away_score:
                return _team_to_out(match.away_team)
            elif match.away_score > match.home_score:
                return _team_to_out(match.home_team)
            else:
                return _team_to_out(match.away_team)

        home_team = _get_community_team_for_slot(match, "home", match_by_id, match_by_num, community_winners, stats, db)
        away_team = _get_community_team_for_slot(match, "away", match_by_id, match_by_num, community_winners, stats, db)

        s = stats.get(match.id)
        if s and s.get("avg_home") is not None and home_team and away_team:
            h_rounded = round(s["avg_home"])
            a_rounded = round(s["avg_away"])
            if h_rounded > a_rounded:
                return away_team
            elif a_rounded > h_rounded:
                return home_team
            else:
                return away_team

        return None

    # Process matches round by round to build community bracket
    def build_community_match(match: models.Match) -> CommunityBracketMatchOut:
        s = stats.get(match.id, {})

        home_team = _get_community_team_for_slot(match, "home", match_by_id, match_by_num, community_winners, stats, db)
        away_team = _get_community_team_for_slot(match, "away", match_by_id, match_by_num, community_winners, stats, db)

        # Determine derived winner
        derived_winner = resolve_community_winner(match)

        return CommunityBracketMatchOut(
            match_id=match.id,
            match_number=match.match_number,
            stage=match.stage,
            match_date=match.match_date,
            venue=match.venue,
            home=CommunityBracketSlotTeam(
                team=home_team,
                slot_label=match.home_slot,
            ),
            away=CommunityBracketSlotTeam(
                team=away_team,
                slot_label=match.away_slot,
            ),
            home_score=match.home_score,
            away_score=match.away_score,
            penalty_winner_id=match.penalty_winner_id,
            is_finished=match.is_finished,
            home_source_match_id=match.home_source_match_id,
            away_source_match_id=match.away_source_match_id,
            prediction_count=s.get("count", 0),
            avg_home_score=s.get("avg_home"),
            avg_away_score=s.get("avg_away"),
            home_win_pct=s.get("home_win_pct"),
            draw_pct=s.get("draw_pct"),
            away_win_pct=s.get("away_win_pct"),
            derived_winner_team=derived_winner,
        )

    # Process by round order so winners propagate correctly
    round_order = ["Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Third-place", "Final"]
    for stage in round_order:
        for m in knockout_matches:
            if m.stage == stage:
                resolve_community_winner(m)

    r32 = [build_community_match(m) for m in knockout_matches if m.stage == "Round of 32"]
    r16 = [build_community_match(m) for m in knockout_matches if m.stage == "Round of 16"]
    qf = [build_community_match(m) for m in knockout_matches if m.stage == "Quarter-finals"]
    sf = [build_community_match(m) for m in knockout_matches if m.stage == "Semi-finals"]
    third = next((build_community_match(m) for m in knockout_matches if m.stage == "Third-place"), None)
    final = next((build_community_match(m) for m in knockout_matches if m.stage == "Final"), None)

    return CommunityBracketOut(
        available=True,
        round_of_32=r32,
        round_of_16=r16,
        quarter_finals=qf,
        semi_finals=sf,
        third_place=third,
        final=final,
    )


def _get_community_team_for_slot(
    match: models.Match,
    side: str,
    match_by_id: dict,
    match_by_num: dict,
    community_winners: dict,
    stats: dict,
    db: Session,
) -> Optional[schemas.TeamOut]:
    """Resolve a team for a bracket slot using real data or community predictions."""
    team_id = match.home_team_id if side == "home" else match.away_team_id
    team_obj = match.home_team if side == "home" else match.away_team
    slot = match.home_slot if side == "home" else match.away_slot
    source_match_id = match.home_source_match_id if side == "home" else match.away_source_match_id

    # If real team is assigned, use it
    if team_id and team_obj:
        return _team_to_out(team_obj)

    # For source match references (R16+), resolve community winner/loser
    if source_match_id and source_match_id in match_by_id:
        source_match = match_by_id[source_match_id]
        is_loser_slot = slot and slot.startswith("L")

        if is_loser_slot:
            # Determine loser
            if source_match.is_finished and source_match.home_score is not None:
                if source_match.home_score > source_match.away_score:
                    return _team_to_out(source_match.away_team)
                elif source_match.away_score > source_match.home_score:
                    return _team_to_out(source_match.home_team)
                else:
                    return _team_to_out(source_match.away_team)

            # Use community prediction for source match
            s = stats.get(source_match.id)
            if s and s.get("avg_home") is not None:
                h_rounded = round(s["avg_home"])
                a_rounded = round(s["avg_away"])
                # Get the teams of the source match
                src_home = _get_community_team_for_slot(source_match, "home", match_by_id, match_by_num, community_winners, stats, db)
                src_away = _get_community_team_for_slot(source_match, "away", match_by_id, match_by_num, community_winners, stats, db)
                if src_home and src_away:
                    if h_rounded > a_rounded:
                        return src_away  # loser
                    elif a_rounded > h_rounded:
                        return src_home  # loser
                    else:
                        return src_away  # draw — away is loser
            return None
        else:
            # Winner slot
            if source_match.id in community_winners:
                return community_winners[source_match.id]

            # If not yet resolved, try to resolve
            if source_match.is_finished and source_match.home_score is not None:
                if source_match.home_score > source_match.away_score:
                    return _team_to_out(source_match.home_team)
                elif source_match.away_score > source_match.home_score:
                    return _team_to_out(source_match.away_team)
                else:
                    return _team_to_out(source_match.home_team)

            s = stats.get(source_match.id)
            if s and s.get("avg_home") is not None:
                h_rounded = round(s["avg_home"])
                a_rounded = round(s["avg_away"])
                src_home = _get_community_team_for_slot(source_match, "home", match_by_id, match_by_num, community_winners, stats, db)
                src_away = _get_community_team_for_slot(source_match, "away", match_by_id, match_by_num, community_winners, stats, db)
                if src_home and src_away:
                    if h_rounded > a_rounded:
                        return src_home
                    elif a_rounded > h_rounded:
                        return src_away
                    else:
                        return src_home
            return None

    return None


# ── Private Communities Management ─────────────────────

@router.post("/private", response_model=schemas.CommunityOut)
def create_private_community(
    req: schemas.CommunityCreate,
    db: Session = Depends(get_db),
    user: schemas.UserOut = Depends(get_current_user),
):
    invite_code = secrets.token_urlsafe(8)
    # Ensure uniqueness (though highly unlikely to collide)
    while db.query(models.Community).filter(models.Community.invite_code == invite_code).first():
        invite_code = secrets.token_urlsafe(8)

    db_user = db.query(models.User).filter(models.User.id == user.id).first()

    community = models.Community(
        name=req.name,
        invite_code=invite_code,
        creator_id=user.id
    )
    db.add(community)
    # Add creator as a member
    community.members.append(db_user)
    
    db.commit()
    db.refresh(community)

    return schemas.CommunityOut(
        id=community.id,
        name=community.name,
        invite_code=community.invite_code,
        creator_id=community.creator_id,
        created_at=community.created_at,
        member_count=1
    )


@router.post("/private/join", response_model=schemas.CommunityOut)
def join_private_community(
    req: schemas.JoinCommunityRequest,
    db: Session = Depends(get_db),
    user: schemas.UserOut = Depends(get_current_user),
):
    from fastapi import HTTPException
    community = db.query(models.Community).filter(models.Community.invite_code == req.invite_code).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found or invalid invite code")

    db_user = db.query(models.User).filter(models.User.id == user.id).first()
    if db_user not in community.members:
        community.members.append(db_user)
        db.commit()
        db.refresh(community)

    return schemas.CommunityOut(
        id=community.id,
        name=community.name,
        invite_code=community.invite_code,
        creator_id=community.creator_id,
        created_at=community.created_at,
        member_count=len(community.members)
    )


@router.get("/private/mine", response_model=list[schemas.CommunityOut])
def get_my_communities(
    db: Session = Depends(get_db),
    user: schemas.UserOut = Depends(get_current_user),
):
    db_user = (
        db.query(models.User)
        .options(joinedload(models.User.communities).joinedload(models.Community.members))
        .filter(models.User.id == user.id)
        .first()
    )
    res = []
    for c in db_user.communities:
        res.append(schemas.CommunityOut(
            id=c.id,
            name=c.name,
            invite_code=c.invite_code,
            creator_id=c.creator_id,
            created_at=c.created_at,
            member_count=len(c.members)
        ))
    return res


from fastapi import HTTPException

@router.delete("/private/{community_id}/leave")
def leave_community(
    community_id: int,
    db: Session = Depends(get_db),
    user: schemas.UserOut = Depends(get_current_user),
):
    db_user = db.query(models.User).filter(models.User.id == user.id).first()
    community = db.query(models.Community).filter(models.Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    
    if community in db_user.communities:
        db_user.communities.remove(community)
        db.commit()
    
    return {"status": "ok"}
