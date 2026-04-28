from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from ..database import get_db
from ..auth import get_optional_user
from .. import models, schemas

router = APIRouter(prefix="/api/matches", tags=["matches"])


@router.get("", response_model=list[schemas.MatchOut])
def list_matches(
    group: Optional[str] = Query(None, description="Filter by group letter (A-L)"),
    stage: Optional[str] = Query(None, description="Filter by stage"),
    finished: Optional[bool] = Query(None, description="Filter finished/upcoming"),
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_user),
):
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

    # Attach user predictions if authenticated
    user_predictions = {}
    if current_user:
        preds = (
            db.query(models.Prediction)
            .filter(models.Prediction.user_id == current_user.id)
            .all()
        )
        user_predictions = {p.match_id: p for p in preds}

    result = []
    for match in matches:
        match_data = schemas.MatchOut(
            id=match.id,
            group_letter=match.group_letter,
            stage=match.stage,
            match_number=match.match_number,
            home_team=schemas.TeamOut.model_validate(match.home_team),
            away_team=schemas.TeamOut.model_validate(match.away_team),
            match_date=match.match_date,
            venue=match.venue,
            home_score=match.home_score,
            away_score=match.away_score,
            is_finished=match.is_finished,
            user_prediction=None,
        )
        if match.id in user_predictions:
            pred = user_predictions[match.id]
            match_data.user_prediction = schemas.PredictionOut(
                id=pred.id,
                match_id=pred.match_id,
                predicted_home_score=pred.predicted_home_score,
                predicted_away_score=pred.predicted_away_score,
                points_awarded=pred.points_awarded,
                created_at=pred.created_at,
                updated_at=pred.updated_at,
            )
        result.append(match_data)

    return result


@router.get("/teams", response_model=list[schemas.TeamOut])
def list_teams(db: Session = Depends(get_db)):
    teams = db.query(models.Team).order_by(models.Team.name).all()
    return teams


@router.get("/standings/{group_letter}", response_model=list[schemas.StandingOut])
def get_standings(group_letter: str, db: Session = Depends(get_db)):
    teams = db.query(models.Team).filter(models.Team.group_letter == group_letter.upper()).all()
    if not teams:
        return []

    matches = (
        db.query(models.Match)
        .filter(models.Match.group_letter == group_letter.upper(), models.Match.is_finished == True)
        .all()
    )

    std_map = {
        t.id: {
            "team_id": t.id,
            "team_name": t.name,
            "team_code": t.code,
            "flag_emoji": t.flag_emoji,
            "played": 0, "won": 0, "drawn": 0, "lost": 0,
            "goals_for": 0, "goals_against": 0, "goal_diff": 0, "points": 0
        }
        for t in teams
    }

    for m in matches:
        if m.home_team_id in std_map and m.away_team_id in std_map:
            home = std_map[m.home_team_id]
            away = std_map[m.away_team_id]

            home["played"] += 1
            away["played"] += 1

            home["goals_for"] += m.home_score
            home["goals_against"] += m.away_score
            away["goals_for"] += m.away_score
            away["goals_against"] += m.home_score

            if m.home_score > m.away_score:
                home["won"] += 1
                home["points"] += 3
                away["lost"] += 1
            elif m.home_score < m.away_score:
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
    # Sort DESC by Points, Goal Diff, Goals For
    standings.sort(key=lambda x: (x["points"], x["goal_diff"], x["goals_for"]), reverse=True)

    return standings


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

    match_data = schemas.MatchOut(
        id=match.id,
        group_letter=match.group_letter,
        stage=match.stage,
        match_number=match.match_number,
        home_team=schemas.TeamOut.model_validate(match.home_team),
        away_team=schemas.TeamOut.model_validate(match.away_team),
        match_date=match.match_date,
        venue=match.venue,
        home_score=match.home_score,
        away_score=match.away_score,
        is_finished=match.is_finished,
        user_prediction=None,
    )

    if current_user:
        pred = (
            db.query(models.Prediction)
            .filter(
                models.Prediction.user_id == current_user.id,
                models.Prediction.match_id == match_id,
            )
            .first()
        )
        if pred:
            match_data.user_prediction = schemas.PredictionOut(
                id=pred.id,
                match_id=pred.match_id,
                predicted_home_score=pred.predicted_home_score,
                predicted_away_score=pred.predicted_away_score,
                points_awarded=pred.points_awarded,
                created_at=pred.created_at,
                updated_at=pred.updated_at,
            )

    return match_data
