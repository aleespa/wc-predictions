"""
Seed the database with all 48 World Cup 2026 teams and matches using auxiliary CSV files.
This script reads from backend/app/data/teams.csv and backend/app/data/matches.csv.
"""
import csv
import os
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from .models import Team, Match, User

SLOT_LABELS = {
    "1A": "Winner Group A", "1B": "Winner Group B", "1C": "Winner Group C",
    "1D": "Winner Group D", "1E": "Winner Group E", "1F": "Winner Group F",
    "1G": "Winner Group G", "1H": "Winner Group H", "1I": "Winner Group I",
    "1J": "Winner Group J", "1K": "Winner Group K", "1L": "Winner Group L",
    "2A": "Runner-up Group A", "2B": "Runner-up Group B", "2C": "Runner-up Group C",
    "2D": "Runner-up Group D", "2E": "Runner-up Group E", "2F": "Runner-up Group F",
    "2G": "Runner-up Group G", "2H": "Runner-up Group H", "2I": "Runner-up Group I",
    "2J": "Runner-up Group J", "2K": "Runner-up Group K", "2L": "Runner-up Group L",
    "3ABCDF": "3rd (A/B/C/D/F)", "3CDFGH": "3rd (C/D/F/G/H)",
    "3CEFHI": "3rd (C/E/F/H/I)", "3EHIJK": "3rd (E/H/I/J/K)",
    "3BEFIJ": "3rd (B/E/F/I/J)", "3AEHIJ": "3rd (A/E/H/I/J)",
    "3EFGIJ": "3rd (E/F/G/I/J)", "3DEIJL": "3rd (D/E/I/J/L)",
}

def seed_database(db: Session):
    """Seed teams and matches from CSV files if the DB is empty."""
    if db.query(Team).count() > 0:
        return

    # 1. Create Admin User (if not exists)
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        try:
            admin = User(
                clerk_id="admin_placeholder_id",
                username="admin",
                is_admin=True,
            )
            db.add(admin)
            db.commit() # Commit admin immediately to avoid duplicate key in other workers
        except Exception:
            db.rollback()
            # If another worker created it, just fetch it
            admin = db.query(User).filter(User.username == "admin").first()

    # Determine paths
    base_dir = os.path.dirname(__file__)
    teams_csv_path = os.path.join(base_dir, "data", "teams.csv")
    matches_csv_path = os.path.join(base_dir, "data", "matches.csv")

    # 2. Seed Teams
    team_map = {} # code -> Team object
    with open(teams_csv_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Check if team already exists
            team = db.query(Team).filter(Team.code == row['code']).first()
            if not team:
                try:
                    with db.begin_nested():
                        team = Team(
                            name=row['name'],
                            code=row['code'],
                            group_letter=row['group_letter'],
                            flag_emoji=row['flag_emoji']
                        )
                        db.add(team)
                        db.flush()
                except Exception:
                    # Another worker might have inserted it
                    team = db.query(Team).filter(Team.code == row['code']).first()
            
            team_map[team.code] = team

    # 3. Seed Matches
    match_num_to_id = {} # match_number -> match.id
    with open(matches_csv_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Store the original ISO 8601 string from CSV (preserves local time + offset)
            match_date_iso = row['match_date']
            
            # Resolve team IDs if codes are present
            home_team_id = team_map[row['home_team']].id if row['home_team'] else None
            away_team_id = team_map[row['away_team']].id if row['away_team'] else None
            
            # Resolve source match IDs if present
            home_source_match_id = match_num_to_id[int(row['home_source_match_num'])] if row['home_source_match_num'] else None
            away_source_match_id = match_num_to_id[int(row['away_source_match_num'])] if row['away_source_match_num'] else None

            # Check if match already exists
            match = db.query(Match).filter(Match.match_number == int(row['match_number'])).first()
            if not match:
                try:
                    with db.begin_nested():
                        match = Match(
                            match_number=int(row['match_number']),
                            stage=row['stage'],
                            group_letter=row['group'] if row['group'] else None,
                            home_team_id=home_team_id,
                            away_team_id=away_team_id,
                            match_date=match_date_iso,
                            venue=row['venue'],
                            home_slot=row['home_slot'] if row['home_slot'] else None,
                            away_slot=row['away_slot'] if row['away_slot'] else None,
                            home_source_match_id=home_source_match_id,
                            away_source_match_id=away_source_match_id
                        )
                        db.add(match)
                        db.flush()
                except Exception:
                    # Another worker might have inserted it
                    match = db.query(Match).filter(Match.match_number == int(row['match_number'])).first()

            match_num_to_id[match.match_number] = match.id

    db.commit()
    print(f"Seeded {len(team_map)} teams and {len(match_num_to_id)} matches from CSV files.")