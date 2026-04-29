from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ── Auth ──────────────────────────────────────────────

class UserOut(BaseModel):
    id: int
    username: Optional[str]
    display_name: Optional[str]
    is_admin: bool
    created_at: datetime
    total_points: Optional[int] = 0
    predictions_count: Optional[int] = 0

    class Config:
        from_attributes = True


# ── Teams ─────────────────────────────────────────────

class TeamOut(BaseModel):
    id: int
    name: str
    code: str
    group_letter: str
    flag_emoji: str

    class Config:
        from_attributes = True


class StandingOut(BaseModel):
    team_id: int
    team_name: str
    team_code: str
    flag_emoji: str
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    goals_for: int = 0
    goals_against: int = 0
    goal_diff: int = 0
    points: int = 0


# ── Matches ───────────────────────────────────────────

class MatchOut(BaseModel):
    id: int
    group_letter: Optional[str]
    stage: str
    match_number: Optional[int]
    home_team: TeamOut
    away_team: TeamOut
    match_date: datetime
    venue: Optional[str]
    home_score: Optional[int]
    away_score: Optional[int]
    is_finished: bool
    user_prediction: Optional["PredictionOut"] = None

    class Config:
        from_attributes = True


class SetResultRequest(BaseModel):
    home_score: int = Field(..., ge=0, le=20)
    away_score: int = Field(..., ge=0, le=20)


class CreateMatchRequest(BaseModel):
    stage: str
    home_team_id: int
    away_team_id: int
    match_date: datetime
    venue: Optional[str] = None
    group_letter: Optional[str] = None


# ── Predictions ───────────────────────────────────────

class PredictionCreate(BaseModel):
    match_id: int
    predicted_home_score: int = Field(..., ge=0, le=20)
    predicted_away_score: int = Field(..., ge=0, le=20)


class PredictionOut(BaseModel):
    id: int
    match_id: int
    predicted_home_score: int
    predicted_away_score: int
    points_awarded: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PredictionWithMatch(BaseModel):
    id: int
    predicted_home_score: int
    predicted_away_score: int
    points_awarded: Optional[int]
    created_at: datetime
    match: MatchOut

    class Config:
        from_attributes = True


# ── Leaderboard ───────────────────────────────────────

class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    username: Optional[str]
    display_name: Optional[str]
    total_points: int
    predictions_count: int
    exact_scores: int
    correct_outcomes: int
