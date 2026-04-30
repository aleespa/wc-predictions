"""
Knockout bracket API — provides the full bracket view with
user-predicted team resolution and predicted standings.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from ..database import get_db
from ..auth import get_current_user, get_optional_user
from .. import models, schemas
from ..seed import SLOT_LABELS

router = APIRouter(prefix="/api/knockout", tags=["knockout"])


def _compute_blended_standings(
    db: Session,
    group_letter: str,
    user_id: Optional[int] = None,
) -> list[dict]:
    """
    Compute standings for a group using real match results where available,
    falling back to the user's predictions for unfinished matches.
    Returns sorted list of standing dicts.
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

    # Get user predictions for this group's matches
    user_preds = {}
    if user_id:
        match_ids = [m.id for m in matches]
        preds = (
            db.query(models.Prediction)
            .filter(
                models.Prediction.user_id == user_id,
                models.Prediction.match_id.in_(match_ids),
            )
            .all()
        )
        user_preds = {p.match_id: p for p in preds}

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

        home = std_map[m.home_team_id]
        away = std_map[m.away_team_id]

        # Use real result if finished, otherwise user prediction
        if m.is_finished and m.home_score is not None:
            h_score = m.home_score
            a_score = m.away_score
        elif m.id in user_preds:
            pred = user_preds[m.id]
            h_score = pred.predicted_home_score
            a_score = pred.predicted_away_score
        else:
            continue  # No data for this match

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


def _resolve_bracket_teams(
    db: Session,
    user_id: Optional[int] = None,
) -> dict:
    """
    Resolve all bracket slot positions to team data.
    Returns dict mapping slot_label -> { team: TeamOut | None, is_predicted: bool }
    """
    # Compute blended standings for every group
    all_standings = {}
    for gl in "ABCDEFGHIJKL":
        all_standings[gl] = _compute_blended_standings(db, gl, user_id)

    resolved = {}

    # Resolve 1X and 2X slots
    for gl, standings in all_standings.items():
        if len(standings) >= 1:
            team = db.query(models.Team).filter(models.Team.id == standings[0]["team_id"]).first()
            if team:
                # Check if this is from real results or predictions
                group_matches = (
                    db.query(models.Match)
                    .filter(
                        models.Match.group_letter == gl,
                        models.Match.stage == "Group Stage",
                    )
                    .all()
                )
                all_finished = all(m.is_finished for m in group_matches)
                resolved[f"1{gl}"] = {
                    "team": team,
                    "is_predicted": not all_finished,
                }

        if len(standings) >= 2:
            team = db.query(models.Team).filter(models.Team.id == standings[1]["team_id"]).first()
            if team:
                group_matches = (
                    db.query(models.Match)
                    .filter(
                        models.Match.group_letter == gl,
                        models.Match.stage == "Group Stage",
                    )
                    .all()
                )
                all_finished = all(m.is_finished for m in group_matches)
                resolved[f"2{gl}"] = {
                    "team": team,
                    "is_predicted": not all_finished,
                }

        # Also track 3rd place teams for later
        if len(standings) >= 3:
            team = db.query(models.Team).filter(models.Team.id == standings[2]["team_id"]).first()
            if team:
                group_matches = (
                    db.query(models.Match)
                    .filter(
                        models.Match.group_letter == gl,
                        models.Match.stage == "Group Stage",
                    )
                    .all()
                )
                all_finished = all(m.is_finished for m in group_matches)
                resolved[f"3{gl}"] = {
                    "team": team,
                    "standing": standings[2],
                    "is_predicted": not all_finished,
                }

    # Resolve 3rd-place slots (e.g. "3ABCDF" — best 3rd from those groups)
    third_place_teams = []
    for gl in "ABCDEFGHIJKL":
        if f"3{gl}" in resolved:
            entry = resolved[f"3{gl}"]
            third_place_teams.append({
                "group": gl,
                "team": entry["team"],
                "standing": entry["standing"],
                "is_predicted": entry["is_predicted"],
            })

    # Sort 3rd-place teams by points, goal diff, goals for
    third_place_teams.sort(
        key=lambda x: (x["standing"]["points"], x["standing"]["goal_diff"], x["standing"]["goals_for"]),
        reverse=True,
    )

    # Top 8 third-place teams advance
    qualifying_thirds = third_place_teams[:8]
    qualifying_groups = set(t["group"] for t in qualifying_thirds)

    # For each 3rd-place slot (e.g. "3ABCDF"), find the best qualifying 3rd-place
    # team from those specific groups
    third_slots = [s for s in SLOT_LABELS.keys() if s.startswith("3") and len(s) > 2]
    for slot in third_slots:
        eligible_groups = set(slot[1:])  # e.g. "3ABCDF" -> {'A','B','C','D','F'}
        # Find qualifying 3rd-place team from eligible groups
        best_match = None
        for qt in qualifying_thirds:
            if qt["group"] in eligible_groups:
                if best_match is None:
                    best_match = qt
                    break  # Take the highest-ranked one
        if best_match:
            resolved[slot] = {
                "team": best_match["team"],
                "is_predicted": best_match["is_predicted"],
            }

    return resolved


def _team_to_out(team: Optional[models.Team]) -> Optional[schemas.TeamOut]:
    if team is None:
        return None
    return schemas.TeamOut.model_validate(team)


@router.get("/bracket", response_model=schemas.BracketOut)
def get_bracket(
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_user),
):
    """
    Get the full knockout bracket with teams resolved from the user's
    predicted standings (or real results where available).
    """
    user_id = current_user.id if current_user else None

    # Resolve bracket teams from standings
    resolved = _resolve_bracket_teams(db, user_id)

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

    # Build a map: match_number -> match for source lookups
    match_num_map = {m.match_number: m for m in knockout_matches}
    match_id_to_num = {m.id: m.match_number for m in knockout_matches}

    # Get user predictions for knockout matches
    user_preds = {}
    if current_user:
        ko_match_ids = [m.id for m in knockout_matches]
        preds = (
            db.query(models.Prediction)
            .filter(
                models.Prediction.user_id == current_user.id,
                models.Prediction.match_id.in_(ko_match_ids),
            )
            .all()
        )
        user_preds = {p.match_id: p for p in preds}

    def resolve_slot(match: models.Match, side: str) -> schemas.BracketSlotTeam:
        """Resolve a bracket slot (home or away) to a team or placeholder."""
        slot = match.home_slot if side == "home" else match.away_slot
        team_id = match.home_team_id if side == "home" else match.away_team_id
        source_match_id = match.home_source_match_id if side == "home" else match.away_source_match_id

        # If the real team is set on the match, use that
        team_obj = match.home_team if side == "home" else match.away_team
        if team_id and team_obj:
            return schemas.BracketSlotTeam(
                team=_team_to_out(team_obj),
                slot_label=slot,
                is_predicted=False,
            )

        # For R32: resolve from group standings
        if slot and not slot.startswith("W") and not slot.startswith("L"):
            if slot in resolved:
                info = resolved[slot]
                return schemas.BracketSlotTeam(
                    team=_team_to_out(info["team"]),
                    slot_label=SLOT_LABELS.get(slot, slot),
                    is_predicted=info["is_predicted"],
                )
            return schemas.BracketSlotTeam(
                team=None,
                slot_label=SLOT_LABELS.get(slot, slot),
                is_predicted=False,
            )

        # For R16+: resolve from source match winner (predicted or real)
        if source_match_id:
            source_match_num = match_id_to_num.get(source_match_id)
            source_match = match_num_map.get(source_match_num) if source_match_num else None

            if source_match:
                # If source match has a real result, use the real winner/loser
                if source_match.is_finished and source_match.home_score is not None:
                    is_loser_slot = slot and slot.startswith("L")
                    if source_match.home_score > source_match.away_score:
                        winner_team = source_match.home_team
                        loser_team = source_match.away_team
                    elif source_match.away_score > source_match.home_score:
                        winner_team = source_match.away_team
                        loser_team = source_match.home_team
                    else:
                        # Draw in knockout — shouldn't happen after ET/pens, but handle gracefully
                        winner_team = source_match.home_team
                        loser_team = source_match.away_team

                    chosen = loser_team if is_loser_slot else winner_team
                    if chosen:
                        return schemas.BracketSlotTeam(
                            team=_team_to_out(chosen),
                            slot_label=slot,
                            is_predicted=False,
                        )

                # If user has a prediction for the source match, use predicted winner
                if source_match.id in user_preds:
                    pred = user_preds[source_match.id]
                    is_loser_slot = slot and slot.startswith("L")

                    # Determine which teams are in the source match
                    source_home = resolve_slot(source_match, "home")
                    source_away = resolve_slot(source_match, "away")

                    if source_home.team and source_away.team:
                        if pred.predicted_home_score > pred.predicted_away_score:
                            winner = source_home.team
                            loser = source_away.team
                        elif pred.predicted_away_score > pred.predicted_home_score:
                            winner = source_away.team
                            loser = source_home.team
                        else:
                            # Predicted draw — default to home team (penalty scenario)
                            winner = source_home.team
                            loser = source_away.team

                        chosen = loser if is_loser_slot else winner
                        return schemas.BracketSlotTeam(
                            team=chosen,
                            slot_label=slot,
                            is_predicted=True,
                        )

        # Fallback: unresolved slot
        label = slot or "TBD"
        if label.startswith("W"):
            label = f"Winner Match {label[1:]}"
        elif label.startswith("L"):
            label = f"Loser Match {label[1:]}"
        return schemas.BracketSlotTeam(
            team=None,
            slot_label=label,
            is_predicted=False,
        )

    def build_bracket_match(match: models.Match) -> schemas.BracketMatchOut:
        pred = user_preds.get(match.id)
        pred_out = None
        if pred:
            pred_out = schemas.PredictionOut(
                id=pred.id,
                match_id=pred.match_id,
                predicted_home_score=pred.predicted_home_score,
                predicted_away_score=pred.predicted_away_score,
                points_awarded=pred.points_awarded,
                created_at=pred.created_at,
                updated_at=pred.updated_at,
                predicted_home_team_id=pred.predicted_home_team_id,
                predicted_away_team_id=pred.predicted_away_team_id,
            )

        return schemas.BracketMatchOut(
            match_id=match.id,
            match_number=match.match_number,
            stage=match.stage,
            match_date=match.match_date,
            venue=match.venue,
            home=resolve_slot(match, "home"),
            away=resolve_slot(match, "away"),
            home_score=match.home_score,
            away_score=match.away_score,
            is_finished=match.is_finished,
            user_prediction=pred_out,
            home_source_match_id=match.home_source_match_id,
            away_source_match_id=match.away_source_match_id,
        )

    # Categorize matches by stage
    r32 = [build_bracket_match(m) for m in knockout_matches if m.stage == "Round of 32"]
    r16 = [build_bracket_match(m) for m in knockout_matches if m.stage == "Round of 16"]
    qf = [build_bracket_match(m) for m in knockout_matches if m.stage == "Quarter-finals"]
    sf = [build_bracket_match(m) for m in knockout_matches if m.stage == "Semi-finals"]
    third = next((build_bracket_match(m) for m in knockout_matches if m.stage == "Third-place"), None)
    final = next((build_bracket_match(m) for m in knockout_matches if m.stage == "Final"), None)

    return schemas.BracketOut(
        round_of_32=r32,
        round_of_16=r16,
        quarter_finals=qf,
        semi_finals=sf,
        third_place=third,
        final=final,
    )


@router.get("/standings/{group_letter}", response_model=list[schemas.StandingOut])
def get_predicted_standings(
    group_letter: str,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_user),
):
    """
    Get group standings blended with the user's predictions.
    Real results take priority; user predictions fill in for unplayed matches.
    """
    user_id = current_user.id if current_user else None
    standings = _compute_blended_standings(db, group_letter, user_id)
    return standings
