"""
Community Predictions API — aggregated prediction statistics
across all users for every match, plus implied group standings
and knockout bracket progression.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/community", tags=["community"])


# ── Pydantic response models ────────────────────────

from pydantic import BaseModel
from typing import Optional
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

def _compute_match_stats(db: Session, match_ids: list[int]) -> dict:
    """
    For each match in match_ids, compute aggregate prediction statistics.
    Returns dict: match_id -> { count, avg_home, avg_away, home_win_pct, draw_pct, away_win_pct }
    """
    if not match_ids:
        return {}

    rows = (
        db.query(
            models.Prediction.match_id,
            func.count(models.Prediction.id).label("cnt"),
            func.avg(models.Prediction.predicted_home_score).label("avg_h"),
            func.avg(models.Prediction.predicted_away_score).label("avg_a"),
        )
        .filter(models.Prediction.match_id.in_(match_ids))
        .group_by(models.Prediction.match_id)
        .all()
    )

    # Build base stats
    stats = {}
    for row in rows:
        stats[row.match_id] = {
            "count": row.cnt,
            "avg_home": round(float(row.avg_h), 1) if row.avg_h is not None else None,
            "avg_away": round(float(row.avg_a), 1) if row.avg_a is not None else None,
        }

    # Compute outcome percentages per match
    for mid in stats:
        preds = (
            db.query(
                models.Prediction.predicted_home_score,
                models.Prediction.predicted_away_score,
            )
            .filter(models.Prediction.match_id == mid)
            .all()
        )
        total = len(preds)
        if total == 0:
            continue
        home_wins = sum(1 for p in preds if p.predicted_home_score > p.predicted_away_score)
        draws = sum(1 for p in preds if p.predicted_home_score == p.predicted_away_score)
        away_wins = total - home_wins - draws

        stats[mid]["home_win_pct"] = round(home_wins / total * 100, 1)
        stats[mid]["draw_pct"] = round(draws / total * 100, 1)
        stats[mid]["away_win_pct"] = round(away_wins / total * 100, 1)

    return stats


# ── Group stage community stats + implied standings ──

@router.get("/matches", response_model=list[CommunityMatchStats])
def get_community_matches(db: Session = Depends(get_db)):
    """
    Get all group-stage matches with community prediction statistics.
    """
    matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.home_team), joinedload(models.Match.away_team))
        .order_by(models.Match.match_date, models.Match.id)
        .all()
    )

    match_ids = [m.id for m in matches]
    stats = _compute_match_stats(db, match_ids)

    result = []
    for m in matches:
        s = stats.get(m.id, {})
        result.append(CommunityMatchStats(
            match_id=m.id,
            group_letter=m.group_letter,
            stage=m.stage,
            match_number=m.match_number,
            match_date=m.match_date,
            venue=m.venue,
            home_team=schemas.TeamOut.model_validate(m.home_team) if m.home_team else None,
            away_team=schemas.TeamOut.model_validate(m.away_team) if m.away_team else None,
            home_score=m.home_score,
            away_score=m.away_score,
            is_finished=m.is_finished,
            home_slot=m.home_slot,
            away_slot=m.away_slot,
            home_source_match_id=m.home_source_match_id,
            away_source_match_id=m.away_source_match_id,
            prediction_count=s.get("count", 0),
            avg_home_score=s.get("avg_home"),
            avg_away_score=s.get("avg_away"),
            home_win_pct=s.get("home_win_pct"),
            draw_pct=s.get("draw_pct"),
            away_win_pct=s.get("away_win_pct"),
        ))

    return result


@router.get("/standings/{group_letter}", response_model=list[schemas.StandingOut])
def get_community_standings(group_letter: str, db: Session = Depends(get_db)):
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
    stats = _compute_match_stats(db, match_ids)

    std_map = {
        t.id: {
            "team_id": t.id,
            "team_name": t.name,
            "team_code": t.code,
            "flag_emoji": t.flag_emoji,
            "played": 0, "won": 0, "drawn": 0, "lost": 0,
            "goals_for": 0, "goals_against": 0, "goal_diff": 0, "points": 0,
        }
        for t in teams
    }

    for m in matches:
        if m.home_team_id not in std_map or m.away_team_id not in std_map:
            continue

        s = stats.get(m.id)
        if not s or s.get("avg_home") is None:
            continue

        # Round avg scores to derive implied result
        h_score = round(s["avg_home"])
        a_score = round(s["avg_away"])

        home = std_map[m.home_team_id]
        away = std_map[m.away_team_id]

        home["played"] += 1
        away["played"] += 1
        home["goals_for"] += h_score
        home["goals_against"] += a_score
        away["goals_for"] += a_score
        away["goals_against"] += h_score

        if h_score > a_score:
            home["won"] += 1
            home["points"] += 3
            away["lost"] += 1
        elif h_score < a_score:
            away["won"] += 1
            away["points"] += 3
            home["lost"] += 1
        else:
            home["drawn"] += 1
            away["drawn"] += 1
            home["points"] += 1
            away["points"] += 1

    for data in std_map.values():
        data["goal_diff"] = data["goals_for"] - data["goals_against"]

    standings = list(std_map.values())
    standings.sort(
        key=lambda x: (x["points"], x["goal_diff"], x["goals_for"]),
        reverse=True,
    )
    return standings


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


def _calculate_points(
    predicted_home: int,
    predicted_away: int,
    actual_home: int,
    actual_away: int,
) -> int:
    """
    Calculate points for a prediction (same logic as admin.calculate_points):
    - Exact score: 5 points
    - Correct outcome + correct goal difference: 3 points
    - Correct outcome only: 1 point
    - Wrong: 0 points
    """
    if predicted_home == actual_home and predicted_away == actual_away:
        return 5

    def outcome(home, away):
        if home > away:
            return "home"
        elif away > home:
            return "away"
        return "draw"

    predicted_outcome = outcome(predicted_home, predicted_away)
    actual_outcome = outcome(actual_home, actual_away)

    if predicted_outcome != actual_outcome:
        return 0

    predicted_diff = predicted_home - predicted_away
    actual_diff = actual_home - actual_away

    if predicted_diff == actual_diff:
        return 3

    return 1


@router.get("/points", response_model=CommunityPointsOut)
def get_community_points(db: Session = Depends(get_db)):
    """
    Compute the community's virtual prediction points.
    For every finished match with predictions, round the community average
    scores and score them against the actual result.
    """
    # Get all finished matches
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
    match_details = []

    for m in finished_matches:
        s = stats.get(m.id)
        if not s or s.get("avg_home") is None:
            continue  # No predictions for this match

        # Round to get community prediction
        pred_home = round(s["avg_home"])
        pred_away = round(s["avg_away"])

        pts = _calculate_points(pred_home, pred_away, m.home_score, m.away_score)
        total_points += pts
        predictions_count += 1

        if pts == 5:
            exact_scores += 1
        if pts >= 1:
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
def get_community_bracket(db: Session = Depends(get_db)):
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
    stats = _compute_match_stats(db, ko_match_ids)

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
