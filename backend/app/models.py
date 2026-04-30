from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    clerk_id = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(50), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=True)
    display_name = Column(String(100), nullable=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    predictions = relationship("Prediction", back_populates="user")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    code = Column(String(3), unique=True, nullable=False)
    group_letter = Column(String(1), nullable=False)
    flag_emoji = Column(String(10), nullable=False)

    home_matches = relationship("Match", foreign_keys="Match.home_team_id", back_populates="home_team")
    away_matches = relationship("Match", foreign_keys="Match.away_team_id", back_populates="away_team")


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    group_letter = Column(String(1), nullable=True)  # NULL for knockout
    stage = Column(String(30), nullable=False, default="Group Stage")
    match_number = Column(Integer, nullable=True)
    home_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)   # nullable for knockout TBD
    away_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)   # nullable for knockout TBD
    match_date = Column(DateTime, nullable=False)
    venue = Column(String(200), nullable=True)
    home_score = Column(Integer, nullable=True)  # NULL until result entered
    away_score = Column(Integer, nullable=True)
    is_finished = Column(Boolean, default=False)

    # Knockout bracket slot identifiers (e.g. "1A" = Winner Group A, "2B" = Runner-up Group B, "3ABCDF" = best 3rd from those groups)
    home_slot = Column(String(20), nullable=True)  # e.g. "2A", "1E", "3ABCDF"
    away_slot = Column(String(20), nullable=True)  # e.g. "2B", "3CDFGH"

    # For R16+ knockout: references to the match whose winner feeds into this slot
    home_source_match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)
    away_source_match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)

    home_team = relationship("Team", foreign_keys=[home_team_id], back_populates="home_matches")
    away_team = relationship("Team", foreign_keys=[away_team_id], back_populates="away_matches")
    predictions = relationship("Prediction", back_populates="match")

    home_source_match = relationship("Match", foreign_keys=[home_source_match_id], remote_side=[id])
    away_source_match = relationship("Match", foreign_keys=[away_source_match_id], remote_side=[id])


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False)
    predicted_home_score = Column(Integer, nullable=False)
    predicted_away_score = Column(Integer, nullable=False)
    points_awarded = Column(Integer, nullable=True)  # NULL until match finished
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # For knockout: track which teams the prediction was made for
    predicted_home_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    predicted_away_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)

    user = relationship("User", back_populates="predictions")
    match = relationship("Match", back_populates="predictions")

    __table_args__ = (
        UniqueConstraint("user_id", "match_id", name="uq_user_match"),
    )
