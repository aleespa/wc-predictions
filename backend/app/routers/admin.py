from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..auth import get_current_admin
from .. import models, schemas

router = APIRouter(prefix="/api/admin", tags=["admin"])


def calculate_points(
    predicted_home: int,
    predicted_away: int,
    actual_home: int,
    actual_away: int,
    predicted_pen_winner: Optional[int] = None,
    actual_pen_winner: Optional[int] = None,
    home_team_id: Optional[int] = None,
    away_team_id: Optional[int] = None,
    is_knockout: bool = False,
) -> int:
    """
    Calculate points for a prediction.
    
    Group Stage:
    - Exact score: 5 points
    - Correct outcome + correct goal difference: 3 points
    - Correct outcome only: 1 point
    - Wrong: 0 points
    
    Knockout Stage:
    - Correct outcome (advancing team): 1 point
    - Correct outcome + correctly predicted penalties: 3 points
    - Correct outcome + correctly predicted penalties + correct penalty winner: 5 points
    """
    
    # Helper to determine who advances
    def get_advancer(h_score, a_score, pen_winner, h_id, a_id):
        if h_score > a_score: return h_id
        if a_score > h_score: return a_id
        return pen_winner

    if not is_knockout:
        # Group Stage Scoring
        if predicted_home == actual_home and predicted_away == actual_away:
            return 5
            
        def outcome(h, a):
            if h > a: return "home"
            if a > h: return "away"
            return "draw"
            
        if outcome(predicted_home, predicted_away) == outcome(actual_home, actual_away):
            if (predicted_home - predicted_away) == (actual_home - actual_away):
                return 3
            return 1
        return 0

    else:
        # Knockout Stage Scoring
        p_advancer = get_advancer(predicted_home, predicted_away, predicted_pen_winner, home_team_id, away_team_id)
        a_advancer = get_advancer(actual_home, actual_away, actual_pen_winner, home_team_id, away_team_id)
        
        if p_advancer != a_advancer or p_advancer is None:
            return 0
            
        # Correct advancer (base 1 point)
        points = 1
        
        # Did it go to penalties? (Draw in regular/extra time)
        p_penalties = (predicted_home == predicted_away)
        a_penalties = (actual_home == actual_away)
        
        if p_penalties and a_penalties:
            points = 3
            # Correct penalty winner?
            if predicted_pen_winner == actual_pen_winner and actual_pen_winner is not None:
                points = 5
                
        return points


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
            is_knockout=is_knockout,
        )

        # Add bracket points for knockout matches
        if is_knockout:
            # Use sets for "regardless of side" comparison
            actual_teams = {match.home_team_id, match.away_team_id}
            predicted_teams = {pred.predicted_home_team_id, pred.predicted_away_team_id}
            
            if actual_teams == predicted_teams and None not in actual_teams and None not in predicted_teams:
                points += 5
                
        pred.points_awarded = points

    db.commit()
    db.refresh(match)

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
        match_date=data.match_date,
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
    matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.home_team), joinedload(models.Match.away_team))
        .order_by(models.Match.match_date, models.Match.id)
        .all()
    )

    return [
        schemas.MatchOut.model_validate(m)
        for m in matches
    ]


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
        match.match_date = data.match_date

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
                # Clear the prediction so user can re-predict
                pred.predicted_home_score = 0
                pred.predicted_away_score = 0
                pred.points_awarded = None

    db.commit()
    return {"status": "ok", "match_id": match_id}
