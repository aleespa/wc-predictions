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


class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=30, pattern="^[a-zA-Z0-9_]+$")
    display_name: Optional[str] = Field(None, min_length=2, max_length=50)


# ── Communities ───────────────────────────────────────

class CommunityCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=100)


class JoinCommunityRequest(BaseModel):
    invite_code: str


class CommunityOut(BaseModel):
    id: int
    name: str
    invite_code: str
    creator_id: int
    created_at: datetime
    member_count: int = 0

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
    is_predicted: bool = False


# ── Matches ───────────────────────────────────────────

class MatchOut(BaseModel):
    id: int
    group_letter: Optional[str]
    stage: str
    match_number: Optional[int]
    home_team: Optional[TeamOut] = None  # nullable for knockout TBD
    away_team: Optional[TeamOut] = None  # nullable for knockout TBD
    match_date: datetime
    venue: Optional[str]
    home_score: Optional[int]
    away_score: Optional[int]
    penalty_winner_id: Optional[int] = None
    is_finished: bool
    user_prediction: Optional["PredictionOut"] = None
    # Knockout slot labels
    home_slot: Optional[str] = None
    away_slot: Optional[str] = None
    # Source match IDs for progressive bracket
    home_source_match_id: Optional[int] = None
    away_source_match_id: Optional[int] = None

    class Config:
        from_attributes = True


class SetResultRequest(BaseModel):
    home_score: int = Field(..., ge=0, le=20)
    away_score: int = Field(..., ge=0, le=20)
    penalty_winner_id: Optional[int] = None


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
    predicted_home_team_id: Optional[int] = None
    predicted_away_team_id: Optional[int] = None
    penalty_winner_id: Optional[int] = None


class PredictionOut(BaseModel):
    id: int
    match_id: int
    predicted_home_score: int
    predicted_away_score: int
    points_awarded: Optional[int]
    created_at: datetime
    updated_at: datetime
    predicted_home_team_id: Optional[int] = None
    predicted_away_team_id: Optional[int] = None
    penalty_winner_id: Optional[int] = None
    is_invalid: bool = False

    class Config:
        from_attributes = True


class PredictionWithMatch(BaseModel):
    id: int
    predicted_home_score: int
    predicted_away_score: int
    points_awarded: Optional[int]
    created_at: datetime
    updated_at: datetime
    predicted_home_team_id: Optional[int] = None
    predicted_away_team_id: Optional[int] = None
    penalty_winner_id: Optional[int] = None
    is_invalid: bool = False
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
    is_community: bool = False


# ── Knockout Bracket ──────────────────────────────────

class BracketSlotTeam(BaseModel):
    """A team slot in the bracket — either a real team or a placeholder label."""
    team: Optional[TeamOut] = None
    slot_label: Optional[str] = None  # e.g. "Winner Group A", "W73" (winner of match 73)
    is_predicted: bool = False  # True if team comes from user's predictions (not real results)


class BracketMatchOut(BaseModel):
    """A single match in the bracket with resolved or placeholder teams."""
    match_id: int
    match_number: Optional[int]
    stage: str
    match_date: datetime
    venue: Optional[str]
    home: BracketSlotTeam
    away: BracketSlotTeam
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    is_finished: bool = False
    user_prediction: Optional[PredictionOut] = None
    is_invalid_prediction: bool = False
    # Source match IDs for building the tree
    home_source_match_id: Optional[int] = None
    away_source_match_id: Optional[int] = None


class BracketOut(BaseModel):
    """Full knockout bracket."""
    round_of_32: list[BracketMatchOut]
    round_of_16: list[BracketMatchOut]
    quarter_finals: list[BracketMatchOut]
    semi_finals: list[BracketMatchOut]
    third_place: Optional[BracketMatchOut] = None
    final: Optional[BracketMatchOut] = None
