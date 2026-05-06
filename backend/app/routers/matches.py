from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from ..database import get_db
from ..auth import get_optional_user
from .. import models, schemas
from ..cache import timed_lru_cache, user_cache

router = APIRouter(prefix="/api/matches", tags=["matches"])


@router.get("", response_model=list[schemas.MatchOut])
def list_matches(
    group: Optional[str] = Query(None, description="Filter by group letter (A-L)"),
    stage: Optional[str] = Query(None, description="Filter by stage"),
    finished: Optional[bool] = Query(None, description="Filter finished/upcoming"),
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_user),
):
    # Try user-specific cache first
    cache_key = f"matches_list:{group}:{stage}:{finished}"
    if current_user:
        cached = user_cache.get(current_user.id, cache_key)
        if cached:
            return cached

    query = (
        db.query(models.Match)
        .options(joinedload(models.Match.home_team), joinedload(models.Match.away_team))
    )

    if group:
        query = query.filter(models.Match.group_letter == group.upper())
    if stage:
        query = query.filter(models.Match.stage == stage)
    if finished is not None:
        query = query.filter(models.Match.is_finished == finished)

    matches = query.order_by(models.Match.match_date, models.Match.id).all()

    # Attach user predictions and resolve speculative teams if authenticated
    user_predictions = {}
    resolved_bracket = {}
    match_num_map = {}
    match_id_to_num = {}
    if current_user:
        preds = (
            db.query(models.Prediction)
            .filter(models.Prediction.user_id == current_user.id)
            .all()
        )
        user_predictions = {p.match_id: p for p in preds}
        
        # Resolve bracket teams for speculative display in knockout
        from .knockout import resolve_bracket_teams, resolve_bracket_slot
        resolved_bracket = resolve_bracket_teams(db, current_user.id)
        
        # We need the match maps for full resolution (R16+)
        ko_matches = db.query(models.Match).filter(models.Match.stage != "Group Stage").all()
        match_num_map = {m.match_number: m for m in ko_matches}
        match_id_to_num = {m.id: m.match_number for m in ko_matches}

    result = []
    for match in matches:
        match_data = schemas.MatchOut.model_validate(match)
        
        # Attach prediction
        if match.id in user_predictions:
            match_data.user_prediction = schemas.PredictionOut.model_validate(user_predictions[match.id])
            
        # Speculative resolution for knockout matches
        if match.stage != "Group Stage" and (not match.home_team_id or not match.away_team_id) and current_user:
            from .knockout import resolve_bracket_slot
            home_res = resolve_bracket_slot(match, "home", resolved_bracket, match_num_map, match_id_to_num, user_predictions)
            away_res = resolve_bracket_slot(match, "away", resolved_bracket, match_num_map, match_id_to_num, user_predictions)
            
            if not match_data.home_team and home_res.team:
                match_data.home_team = home_res.team
                match_data.is_home_predicted = home_res.is_predicted
            
            if not match_data.away_team and away_res.team:
                match_data.away_team = away_res.team
                match_data.is_away_predicted = away_res.is_predicted
                    
        result.append(match_data)

    # Cache for 30 seconds
    if current_user:
        # Store as serializable list of dicts
        serializable_result = [m.model_dump(mode='json') for m in result]
        user_cache.set(current_user.id, cache_key, serializable_result)

    return result


@timed_lru_cache(seconds=600)
def _get_cached_teams():
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        teams = db.query(models.Team).order_by(models.Team.name).all()
        # Return serializable data
        return [schemas.TeamOut.model_validate(t).model_dump() for t in teams]
    finally:
        db.close()

@router.get("/teams", response_model=list[schemas.TeamOut])
def list_teams(db: Session = Depends(get_db)):
    return _get_cached_teams()


@router.get("/standings/{group_letter}", response_model=list[schemas.StandingOut])
def get_standings(
    group_letter: str, 
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_user)
):
    teams = db.query(models.Team).filter(models.Team.group_letter == group_letter.upper()).all()
    if not teams:
        return []

    # Get all group matches
    matches = (
        db.query(models.Match)
        .filter(models.Match.group_letter == group_letter.upper())
        .all()
    )

    # Get user predictions if authenticated
    user_predictions = {}
    if current_user:
        preds = (
            db.query(models.Prediction)
            .filter(models.Prediction.user_id == current_user.id)
            .all()
        )
        user_predictions = {p.match_id: p for p in preds}

    from ..utils import compute_standings
    
    def get_scores(m):
        if m.is_finished:
            return (m.home_score, m.away_score, False)
        elif m.id in user_predictions:
            pred = user_predictions[m.id]
            return (pred.predicted_home_score, pred.predicted_away_score, True)
        return None

    return compute_standings(teams, matches, get_scores)


@router.get("/thirds", response_model=list[schemas.StandingOut])
def get_thirds_standings(
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_user)
):
    from .knockout import resolve_bracket_teams
    
    # 1. Bulk fetch all teams, group stage matches, and user predictions
    teams = db.query(models.Team).all()
    group_matches = db.query(models.Match).filter(models.Match.stage == "Group Stage").all()
    
    user_preds = {}
    if current_user:
        preds = db.query(models.Prediction).filter(models.Prediction.user_id == current_user.id).all()
        user_preds = {p.match_id: p for p in preds}

    # Map teams by ID and group
    teams_by_group = {}
    for t in teams:
        teams_by_group.setdefault(t.group_letter, []).append(t)

    matches_by_group = {}
    for m in group_matches:
        matches_by_group.setdefault(m.group_letter, []).append(m)

    from ..utils import compute_standings
    
    def get_scores(m):
        if m.is_finished and m.home_score is not None:
            return (m.home_score, m.away_score, False)
        elif m.id in user_preds:
            pred = user_preds[m.id]
            return (pred.predicted_home_score, pred.predicted_away_score, True)
        return None

    all_thirds = []
    for gl in "ABCDEFGHIJKL":
        group_teams = teams_by_group.get(gl, [])
        group_matches_list = matches_by_group.get(gl, [])
        standings = compute_standings(group_teams, group_matches_list, get_scores)
        if len(standings) >= 3:
            all_finished = all((m.is_finished and m.home_score is not None) for m in group_matches_list if m.home_team_id and m.away_team_id)
            third = standings[2]
            third["is_predicted"] = third["is_predicted"] or (not all_finished)
            third["group_letter"] = gl
            all_thirds.append(third)

    # 3. Sort ALL 3rd place teams by performance
    all_thirds.sort(key=lambda x: (x["points"], x["goal_diff"], x["goals_for"]), reverse=True)
    return all_thirds


@router.get("/{match_id}", response_model=schemas.MatchOut)
def get_match(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_user),
):
    match = (
        db.query(models.Match)
        .options(joinedload(models.Match.home_team), joinedload(models.Match.away_team))
        .filter(models.Match.id == match_id)
        .first()
    )
    if not match:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    match_data = schemas.MatchOut.model_validate(match)

    if current_user:
        # Load user prediction
        pred = (
            db.query(models.Prediction)
            .filter(
                models.Prediction.user_id == current_user.id,
                models.Prediction.match_id == match_id,
            )
            .first()
        )
        if pred:
            match_data.user_prediction = schemas.PredictionOut.model_validate(pred)

    # For knockout matches without official teams, resolve speculatively
    if match.stage != "Group Stage" and (not match.home_team_id or not match.away_team_id):
        from .knockout import resolve_bracket_teams, resolve_bracket_slot
        
        user_id = current_user.id if current_user else None
        resolved = resolve_bracket_teams(db, user_id)
        
        # We need the match maps for resolution
        ko_matches = db.query(models.Match).filter(models.Match.stage != "Group Stage").all()
        match_num_map = {m.match_number: m for m in ko_matches}
        match_id_to_num = {m.id: m.match_number for m in ko_matches}
        
        # User predictions for knockout matches
        ko_preds = {}
        if user_id:
            ko_ids = [m.id for m in ko_matches]
            preds = db.query(models.Prediction).filter(
                models.Prediction.user_id == user_id,
                models.Prediction.match_id.in_(ko_ids)
            ).all()
            ko_preds = {p.match_id: p for p in preds}

        home_res = resolve_bracket_slot(match, "home", resolved, match_num_map, match_id_to_num, ko_preds)
        away_res = resolve_bracket_slot(match, "away", resolved, match_num_map, match_id_to_num, ko_preds)
        
        if not match_data.home_team and home_res.team:
            match_data.home_team = home_res.team
            match_data.is_home_predicted = home_res.is_predicted
        if not match_data.away_team and away_res.team:
            match_data.away_team = away_res.team
            match_data.is_away_predicted = away_res.is_predicted
            
        # Also detect if existing prediction is invalid (teams changed)
        if match_data.user_prediction:
            p_home = match_data.user_prediction.predicted_home_team_id
            p_away = match_data.user_prediction.predicted_away_team_id
            
            r_home = home_res.team.id if home_res.team else None
            r_away = away_res.team.id if away_res.team else None
            
            if r_home and r_away and p_home and p_away:
                if {p_home, p_away} != {r_home, r_away}:
                    match_data.user_prediction.is_invalid = True
                    match_data.is_invalid_prediction = True
            elif match_data.user_prediction and (not r_home or not r_away):
                # If prediction exists but teams are no longer resolved, it's definitely invalid
                match_data.user_prediction.is_invalid = True
                match_data.is_invalid_prediction = True

    return match_data
