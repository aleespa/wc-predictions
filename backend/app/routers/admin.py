from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_admin
from .. import models, schemas

router = APIRouter(prefix="/api/admin", tags=["admin"])


def calculate_points(
    predicted_home: int,
    predicted_away: int,
    actual_home: int,
    actual_away: int,
) -> int:
    """
    Calculate points for a prediction:
    - Exact score: 5 points
    - Correct outcome + correct goal difference: 3 points
    - Correct outcome only: 1 point
    - Wrong: 0 points
    """
    # Exact score match
    if predicted_home == actual_home and predicted_away == actual_away:
        return 5

    # Determine outcomes
    def outcome(home, away):
        if home > away:
            return "home"
        elif away > home:
            return "away"
        return "draw"

    predicted_outcome = outcome(predicted_home, predicted_away)
    actual_outcome = outcome(actual_home, actual_away)

    if predicted_outcome != actual_outcome:
        return 0  # Wrong outcome

    # Correct outcome — check goal difference
    predicted_diff = predicted_home - predicted_away
    actual_diff = actual_home - actual_away

    if predicted_diff == actual_diff:
        return 3  # Correct outcome + goal difference

    return 1  # Correct outcome only


@router.put("/matches/{match_id}/result", response_model=schemas.MatchOut)
def set_match_result(
    match_id: int,
    data: schemas.SetResultRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    match = (
        db.query(models.Match)
        .filter(models.Match.id == match_id)
        .first()
    )
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # Set the result
    match.home_score = data.home_score
    match.away_score = data.away_score
    match.is_finished = True

    # Calculate points for all predictions on this match
    predictions = (
        db.query(models.Prediction)
        .filter(models.Prediction.match_id == match_id)
        .all()
    )

    for pred in predictions:
        pred.points_awarded = calculate_points(
            pred.predicted_home_score,
            pred.predicted_away_score,
            data.home_score,
            data.away_score,
        )

    db.commit()
    db.refresh(match)

    # Load relationships for response
    home_team = db.query(models.Team).filter(models.Team.id == match.home_team_id).first()
    away_team = db.query(models.Team).filter(models.Team.id == match.away_team_id).first()

    return schemas.MatchOut(
        id=match.id,
        group_letter=match.group_letter,
        stage=match.stage,
        match_number=match.match_number,
        home_team=schemas.TeamOut.model_validate(home_team),
        away_team=schemas.TeamOut.model_validate(away_team),
        match_date=match.match_date,
        venue=match.venue,
        home_score=match.home_score,
        away_score=match.away_score,
        is_finished=match.is_finished,
    )


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

    return schemas.MatchOut(
        id=match.id,
        group_letter=match.group_letter,
        stage=match.stage,
        match_number=match.match_number,
        home_team=schemas.TeamOut.model_validate(home_team),
        away_team=schemas.TeamOut.model_validate(away_team),
        match_date=match.match_date,
        venue=match.venue,
        home_score=match.home_score,
        away_score=match.away_score,
        is_finished=match.is_finished,
    )


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
        schemas.MatchOut(
            id=m.id,
            group_letter=m.group_letter,
            stage=m.stage,
            match_number=m.match_number,
            home_team=schemas.TeamOut.model_validate(m.home_team),
            away_team=schemas.TeamOut.model_validate(m.away_team),
            match_date=m.match_date,
            venue=m.venue,
            home_score=m.home_score,
            away_score=m.away_score,
            is_finished=m.is_finished,
        )
        for m in matches
    ]
