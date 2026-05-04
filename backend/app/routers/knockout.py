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
import re
import json
import os

# FIFA 2026 Annex C: 495 possible combinations of best third-placed teams
# Load FIFA 2026 Annex C from JSON data
current_dir = os.path.dirname(__file__)
annex_c_path = os.path.join(current_dir, "..", "data", "annex_c.json")
try:
    with open(annex_c_path, "r", encoding="utf-8") as f:
        ANNEX_C_MAP = json.load(f)
except FileNotFoundError:
    # Fallback or log error
    ANNEX_C_MAP = {}

router = APIRouter(prefix="/api/knockout", tags=["knockout"])


def compute_blended_standings(
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


def resolve_bracket_teams(
    db: Session,
    user_id: Optional[int] = None,
) -> dict:
    """
    Resolve all bracket slot positions to team data.
    Returns dict mapping slot_label -> { team: TeamOut | None, is_predicted: bool }
    """
    # 1. Bulk fetch all teams, group stage matches, and user predictions
    teams = db.query(models.Team).all()
    group_matches = db.query(models.Match).filter(models.Match.stage == "Group Stage").all()
    
    user_preds = {}
    if user_id:
        preds = db.query(models.Prediction).filter(models.Prediction.user_id == user_id).all()
        user_preds = {p.match_id: p for p in preds}

    # Map teams by ID and group
    teams_by_id = {t.id: t for t in teams}
    teams_by_group = {}
    for t in teams:
        teams_by_group.setdefault(t.group_letter, []).append(t)

    matches_by_group = {}
    for m in group_matches:
        matches_by_group.setdefault(m.group_letter, []).append(m)

    # 2. Compute standings for all groups in memory
    all_standings = {}
    for gl in "ABCDEFGHIJKL":
        group_teams = teams_by_group.get(gl, [])
        group_matches_list = matches_by_group.get(gl, [])
        
        std_map = {
            t.id: {
                "team_id": t.id, "team_name": t.name, "team_code": t.code, "flag_emoji": t.flag_emoji,
                "played": 0, "won": 0, "drawn": 0, "lost": 0,
                "goals_for": 0, "goals_against": 0, "goal_diff": 0, "points": 0,
            }
            for t in group_teams
        }

        for m in group_matches_list:
            if m.home_team_id not in std_map or m.away_team_id not in std_map:
                continue
            
            # Real result if finished, else user prediction
            if m.is_finished and m.home_score is not None:
                h_score, a_score = m.home_score, m.away_score
            elif m.id in user_preds:
                p = user_preds[m.id]
                h_score, a_score = p.predicted_home_score, p.predicted_away_score
            else:
                continue

            home, away = std_map[m.home_team_id], std_map[m.away_team_id]
            home["played"] += 1; away["played"] += 1
            home["goals_for"] += h_score; home["goals_against"] += a_score
            away["goals_for"] += a_score; away["goals_against"] += h_score

            if h_score > a_score:
                home["won"] += 1; home["points"] += 3; away["lost"] += 1
            elif h_score < a_score:
                away["won"] += 1; away["points"] += 3; home["lost"] += 1
            else:
                home["drawn"] += 1; home["points"] += 1; away["drawn"] += 1; away["points"] += 1

        standings = list(std_map.values())
        standings.sort(key=lambda x: (x["points"], x["goal_diff"], x["goals_for"]), reverse=True)
        all_standings[gl] = standings

    # 3. Resolve slots
    resolved = {}
    for gl, standings in all_standings.items():
        group_matches_list = matches_by_group.get(gl, [])
        all_finished = all(m.is_finished for m in group_matches_list)
        
        for i, prefix in enumerate(["1", "2", "3"]):
            if len(standings) > i:
                team_id = standings[i]["team_id"]
                resolved[f"{prefix}{gl}"] = {
                    "team": teams_by_id[team_id],
                    "is_predicted": not all_finished,
                    "standing": standings[i] if i == 2 else None
                }

    # 4. Resolve Best 3rd place slots
    third_place_teams = []
    for gl, v in resolved.items():
        if len(gl) == 2 and gl.startswith("3") and v.get("standing"):
            group_letter = gl[1:]
            third_place_teams.append({
                "group": group_letter,
                "team": v["team"],
                "standing": v["standing"],
                "is_predicted": v["is_predicted"]
            })
    
    # Sort ALL 3rd place teams by performance (Points, GD, GF)
    third_place_teams.sort(key=lambda x: (
        x["standing"]["points"], 
        x["standing"]["goal_diff"], 
        x["standing"]["goals_for"]
    ), reverse=True)
    
    # Top 8 qualify
    qualifying_thirds = third_place_teams[:8]
    qualifying_groups_set = {qt["group"] for qt in qualifying_thirds}
    qualifying_key = "".join(sorted(list(qualifying_groups_set)))

    # Use Annex C Map if possible
    if qualifying_key in ANNEX_C_MAP:
        mapping = ANNEX_C_MAP[qualifying_key]
        thirds_by_group = {qt["group"]: qt for qt in qualifying_thirds}
        
        target_map = {
            "1E": "3ABCDF", "1I": "3CDFGH", "1A": "3CEFHI", "1L": "3EHIJK",
            "1D": "3BEFIJ", "1G": "3AEHIJ", "1B": "3EFGIJ", "1K": "3DEIJL"
        }

        for match_winner_slot, third_group in mapping.items():
            if third_group in thirds_by_group:
                qt = thirds_by_group[third_group]
                if match_winner_slot in target_map:
                    actual_slot = target_map[match_winner_slot]
                    resolved[actual_slot] = {"team": qt["team"], "is_predicted": qt["is_predicted"]}
    else:
        # Fallback to a simple assignment if the specific combination is missing from our Annex C map
        third_slots_list = ["3ABCDF", "3CDFGH", "3CEFHI", "3EHIJK", "3BEFIJ", "3AEHIJ", "3EFGIJ", "3DEIJL"]
        for i, qt in enumerate(qualifying_thirds):
            if i < len(third_slots_list):
                slot = third_slots_list[i]
                resolved[slot] = {"team": qt["team"], "is_predicted": qt["is_predicted"]}

    return resolved


def resolve_bracket_slot(
    match: models.Match,
    side: str,
    resolved: dict,
    match_num_map: dict,
    match_id_to_num: dict,
    user_preds: dict,
) -> schemas.BracketSlotTeam:
    """Resolve a bracket slot (home or away) to a team or placeholder."""
    slot = match.home_slot if side == "home" else match.away_slot
    team_id = match.home_team_id if side == "home" else match.away_team_id
    source_match_id = (
        match.home_source_match_id if side == "home" else match.away_source_match_id
    )

    # If the real team is set on the match, use that
    team_obj = match.home_team if side == "home" else match.away_team
    if team_id and team_obj:
        return schemas.BracketSlotTeam(
            team=team_to_out(team_obj),
            slot_label=slot,
            is_predicted=False,
        )

    # For R32: resolve from group standings
    if slot and not slot.startswith("W") and not slot.startswith("L"):
        if slot in resolved:
            info = resolved[slot]
            return schemas.BracketSlotTeam(
                team=team_to_out(info["team"]),
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
                    winner_team = source_match.home_team
                    loser_team = source_match.away_team

                chosen = loser_team if is_loser_slot else winner_team
                if chosen:
                    return schemas.BracketSlotTeam(
                        team=team_to_out(chosen),
                        slot_label=slot,
                        is_predicted=False,
                    )

            # If user has a prediction for the source match, use predicted winner
            if source_match.id in user_preds:
                pred = user_preds[source_match.id]
                is_loser_slot = slot and slot.startswith("L")

                source_home = resolve_bracket_slot(
                    source_match, "home", resolved, match_num_map, match_id_to_num, user_preds
                )
                source_away = resolve_bracket_slot(
                    source_match, "away", resolved, match_num_map, match_id_to_num, user_preds
                )

                if source_home.team and source_away.team:
                    if pred.predicted_home_score > pred.predicted_away_score:
                        winner = source_home.team
                        loser = source_away.team
                    elif pred.predicted_away_score > pred.predicted_home_score:
                        winner = source_away.team
                        loser = source_home.team
                    else:
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


def build_bracket_match_data(
    match: models.Match,
    user_preds: dict,
    resolved: dict,
    match_num_map: dict,
    match_id_to_num: dict,
) -> schemas.BracketMatchOut:
    pred = user_preds.get(match.id)

    home_slot = resolve_bracket_slot(
        match, "home", resolved, match_num_map, match_id_to_num, user_preds
    )
    away_slot = resolve_bracket_slot(
        match, "away", resolved, match_num_map, match_id_to_num, user_preds
    )

    is_invalid = False
    if pred and match.stage != "Group Stage":
        pred_home_id = pred.predicted_home_team_id
        pred_away_id = pred.predicted_away_team_id
        resolved_home_id = home_slot.team.id if home_slot.team else None
        resolved_away_id = away_slot.team.id if away_slot.team else None

        if resolved_home_id and resolved_away_id:
            pred_set = {pred_home_id, pred_away_id}
            res_set = {resolved_home_id, resolved_away_id}
            if pred_set != res_set:
                is_invalid = True

    pred_out = None
    if pred:
        pred_out = schemas.PredictionOut.model_validate(pred)
        pred_out.is_invalid = is_invalid

    return schemas.BracketMatchOut(
        match_id=match.id,
        match_number=match.match_number,
        stage=match.stage,
        match_date=match.match_date,
        venue=match.venue,
        home=home_slot,
        away=away_slot,
        home_score=match.home_score,
        away_score=match.away_score,
        is_finished=match.is_finished,
        user_prediction=pred_out,
        is_invalid_prediction=is_invalid,
        home_source_match_id=match.home_source_match_id,
        away_source_match_id=match.away_source_match_id,
    )


def team_to_out(team: Optional[models.Team]) -> Optional[schemas.TeamOut]:
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
    # Determine if bracket is unlocked
    # 1. Check if all group stage matches are finished
    group_matches = db.query(models.Match).filter(models.Match.stage == "Group Stage").all()
    all_finished = all(m.is_finished for m in group_matches)
    
    # 2. Check if user has predicted all group stage matches
    user_predicted_all = False
    if current_user:
        group_match_ids = [m.id for m in group_matches]
        group_preds_count = (
            db.query(models.Prediction)
            .filter(
                models.Prediction.user_id == current_user.id,
                models.Prediction.match_id.in_(group_match_ids)
            )
            .count()
        )
        user_predicted_all = group_preds_count >= len(group_matches)

    is_unlocked = all_finished or user_predicted_all
    unlock_reason = None
    if not is_unlocked:
        unlock_reason = "Complete all group-stage predictions to unlock the bracket"
    elif all_finished:
        unlock_reason = "Round of 32 is officially defined"
    else:
        unlock_reason = "All group stage matches predicted"

    user_id = current_user.id if current_user else None

    # Resolve bracket teams from standings
    resolved = resolve_bracket_teams(db, user_id)

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

    # Categorize matches by stage
    r32 = [
        build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
        for m in knockout_matches
        if m.stage == "Round of 32"
    ]
    r16 = [
        build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
        for m in knockout_matches
        if m.stage == "Round of 16"
    ]
    qf = [
        build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
        for m in knockout_matches
        if m.stage == "Quarter-finals"
    ]
    sf = [
        build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
        for m in knockout_matches
        if m.stage == "Semi-finals"
    ]
    third = next(
        (
            build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
            for m in knockout_matches
            if m.stage == "Third-place"
        ),
        None,
    )
    final = next(
        (
            build_bracket_match_data(m, user_preds, resolved, match_num_map, match_id_to_num)
            for m in knockout_matches
            if m.stage == "Final"
        ),
        None,
    )

    return schemas.BracketOut(
        round_of_32=r32,
        round_of_16=r16,
        quarter_finals=qf,
        semi_finals=sf,
        third_place=third,
        final=final,
        is_unlocked=is_unlocked,
        unlock_reason=unlock_reason
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
    standings = compute_blended_standings(db, group_letter, user_id)
    return standings
