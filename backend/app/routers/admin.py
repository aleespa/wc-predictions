from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..auth import get_current_admin
from ..cache import user_cache
from .. import models, schemas

router = APIRouter(prefix="/api/admin", tags=["admin"])


def propagate_knockout_results(db: Session, match: models.Match):
    """
    Determines the winner and loser of a match and updates any dependent matches.
    """
    if not match.is_finished:
        return

    # Determine winner and loser IDs
    winner_id = None
    loser_id = None
    if (match.home_score or 0) > (match.away_score or 0):
        winner_id = match.home_team_id
        loser_id = match.away_team_id
    elif (match.away_score or 0) > (match.home_score or 0):
        winner_id = match.away_team_id
        loser_id = match.home_team_id
    else:
        # Draw: use penalty winner
        winner_id = match.penalty_winner_id
        loser_id = match.home_team_id if winner_id == match.away_team_id else match.away_team_id

    if not winner_id:
        return

    # Find all matches that depend on this match as a source
    dependents = db.query(models.Match).filter(
        (models.Match.home_source_match_id == match.id) | 
        (models.Match.away_source_match_id == match.id)
    ).all()

    for dep in dependents:
        # Update home slot if it's fed by this match
        if dep.home_source_match_id == match.id:
            slot = dep.home_slot or ""
            if slot.startswith("W"):
                dep.home_team_id = winner_id
            elif slot.startswith("L"):
                dep.home_team_id = loser_id
        
        # Update away slot if it's fed by this match
        if dep.away_source_match_id == match.id:
            slot = dep.away_slot or ""
            if slot.startswith("W"):
                dep.away_team_id = winner_id
            elif slot.startswith("L"):
                dep.away_team_id = loser_id

    db.commit()


def invalidate_user_brackets(db: Session):
    """
    Called when all group matches are finished or a knockout match result is entered.
    """
    from .knockout import invalidate_single_user_bracket, resolve_bracket_teams, resolve_bracket_slot
    
    # 1. Resolve official R32 seeding (and higher if matches finished)
    real_resolved = resolve_bracket_teams(db, user_id=None)
    
    # 2. Get all knockout matches and maps
    ko_matches = db.query(models.Match).filter(models.Match.stage != "Group Stage").order_by(models.Match.match_number).all()
    match_num_map = {m.match_number: m for m in ko_matches}
    match_id_to_num = {m.id: m.match_number for m in ko_matches}
    
    # 3. Update the actual matches with official teams for R32
    # This is a safety pass for R32 (though propagation handles R16+)
    for m in ko_matches:
        if m.stage == "Round of 32":
            off_h = resolve_bracket_slot(m, "home", real_resolved, match_num_map, match_id_to_num, {})
            off_a = resolve_bracket_slot(m, "away", real_resolved, match_num_map, match_id_to_num, {})
            if off_h.team:
                m.home_team_id = off_h.team.id
            if off_a.team:
                m.away_team_id = off_a.team.id
    
    db.commit()

    # 4. Invalidate predictions for all users using their speculative standings
    users = db.query(models.User).all()
    for user in users:
        invalidate_single_user_bracket(db, user.id)



from ..utils import calculate_points


@router.put("/matches/{match_id}/result", response_model=schemas.MatchOut)
def set_match_result(
    match_id: int,
    data: schemas.SetResultRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    match = (
        db.query(models.Match)
        .options(joinedload(models.Match.home_team), joinedload(models.Match.away_team))
        .filter(models.Match.id == match_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # Set the result
    match.home_score = data.home_score
    match.away_score = data.away_score
    match.penalty_winner_id = data.penalty_winner_id
    match.is_finished = True

    # Calculate points for all predictions on this match
    predictions = (
        db.query(models.Prediction)
        .filter(models.Prediction.match_id == match_id)
        .all()
    )

    is_knockout = match.stage != "Group Stage"

    for pred in predictions:
        points = calculate_points(
            pred.predicted_home_score,
            pred.predicted_away_score,
            data.home_score,
            data.away_score,
            predicted_pen_winner=pred.penalty_winner_id,
            actual_pen_winner=data.penalty_winner_id,
            home_team_id=match.home_team_id,
            away_team_id=match.away_team_id,
            stage=match.stage,
        )

        pred.points_awarded = points

    db.commit()
    db.refresh(match)

    # Propagation for knockout matches
    if is_knockout:
        propagate_knockout_results(db, match)
        # Re-run invalidation to mark predictions that are now officially impossible
        invalidate_user_brackets(db)

    # Invalidate all match list caches so everyone sees the update immediately
    user_cache.clear_all()

    # If this was a group stage match, check if all group matches are finished
    if match.stage == "Group Stage":
        group_total = db.query(models.Match).filter(models.Match.stage == "Group Stage").count()
        group_finished = db.query(models.Match).filter(
            models.Match.stage == "Group Stage",
            models.Match.is_finished == True
        ).count()
        
        if group_total == group_finished:
            # TRIGGER FINAL INVALIDATION PASS
            invalidate_user_brackets(db)

    return schemas.MatchOut.model_validate(match)


@router.post("/matches", response_model=schemas.MatchOut)
def create_match(
    data: schemas.CreateMatchRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    """Create a new match (e.g., knockout stage)."""
    # Verify teams exist
    home_team = db.query(models.Team).filter(models.Team.id == data.home_team_id).first()
    away_team = db.query(models.Team).filter(models.Team.id == data.away_team_id).first()
    if not home_team or not away_team:
        raise HTTPException(status_code=404, detail="Team not found")

    match = models.Match(
        group_letter=data.group_letter,
        stage=data.stage,
        home_team_id=data.home_team_id,
        away_team_id=data.away_team_id,
        match_date=data.match_date.isoformat(),
        venue=data.venue,
    )
    db.add(match)
    db.commit()
    db.refresh(match)

    return schemas.MatchOut.model_validate(match)


@router.get("/matches", response_model=list[schemas.MatchOut])
def admin_list_matches(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    """List all matches for admin management."""
    from sqlalchemy.orm import joinedload
    from .knockout import resolve_bracket_teams, resolve_bracket_slot
    
    matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.home_team), joinedload(models.Match.away_team))
        .order_by(models.Match.match_date, models.Match.id)
        .all()
    )
    
    # Resolve official bracket teams
    real_resolved = resolve_bracket_teams(db, user_id=None)
    match_num_map = {m.match_number: m for m in matches if m.stage != "Group Stage"}
    match_id_to_num = {m.id: m.match_number for m in matches if m.stage != "Group Stage"}

    out = []
    for m in matches:
        m_out = schemas.MatchOut.model_validate(m)
        
        # If knockout and teams are missing, try to resolve them for display
        if m.stage != "Group Stage":
            if not m_out.home_team:
                slot_h = resolve_bracket_slot(m, "home", real_resolved, match_num_map, match_id_to_num, {})
                if slot_h.team:
                    m_out.home_team = slot_h.team
                    m_out.home_team_id = slot_h.team.id
                    m_out.is_home_predicted = slot_h.is_predicted
            if not m_out.away_team:
                slot_a = resolve_bracket_slot(m, "away", real_resolved, match_num_map, match_id_to_num, {})
                if slot_a.team:
                    m_out.away_team = slot_a.team
                    m_out.away_team_id = slot_a.team.id
                    m_out.is_away_predicted = slot_a.is_predicted
        out.append(m_out)

    return out


class MatchUpdateRequest(BaseModel):
    """Override teams or timing for a match (admin)."""
    home_team_id: Optional[int] = None
    away_team_id: Optional[int] = None
    match_date: Optional[datetime] = None
    venue: Optional[str] = None


@router.put("/matches/{match_id}")
def update_match(
    match_id: int,
    data: MatchUpdateRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    """Admin override: set or correct teams, date, or venue for a match."""
    match = db.query(models.Match).filter(models.Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    if data.home_team_id is not None:
        if match.stage == "Group Stage" and data.home_team_id != match.home_team_id:
             raise HTTPException(status_code=400, detail="Cannot override group stage match teams")
        team = db.query(models.Team).filter(models.Team.id == data.home_team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Home team not found")
        match.home_team_id = data.home_team_id

    if data.away_team_id is not None:
        if match.stage == "Group Stage" and data.away_team_id != match.away_team_id:
             raise HTTPException(status_code=400, detail="Cannot override group stage match teams")
        team = db.query(models.Team).filter(models.Team.id == data.away_team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Away team not found")
        match.away_team_id = data.away_team_id
        
    if data.match_date is not None:
        match.match_date = data.match_date.isoformat()

    if data.venue is not None:
        match.venue = data.venue

    # Invalidate predictions where the teams changed (knockout only)
    if (data.home_team_id is not None or data.away_team_id is not None) and match.stage != "Group Stage":
        preds = db.query(models.Prediction).filter(
            models.Prediction.match_id == match_id,
        ).all()
        for pred in preds:
            teams_match = True
            if pred.predicted_home_team_id and data.home_team_id:
                if pred.predicted_home_team_id != data.home_team_id:
                    teams_match = False
            if pred.predicted_away_team_id and data.away_team_id:
                if pred.predicted_away_team_id != data.away_team_id:
                    teams_match = False
            if not teams_match:
                pred.is_invalid = True

    db.commit()
    return {"status": "ok", "match_id": match_id}
