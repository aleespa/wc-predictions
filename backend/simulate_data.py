import sys
import os
import random
import uuid

# Add the parent directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User, Match, Prediction, Team
from app.routers.knockout import resolve_bracket_teams, resolve_bracket_slot
from app.routers.admin import invalidate_user_brackets
from app.cache import user_cache

FOOTBALL_USERNAMES = [
    ("el_toro_blanco", "El Toro Blanco"),
    ("penalty_king", "Penalty King"),
    ("offside_trap", "Offside Trap"),
    ("golden_boot", "Golden Boot"),
    ("free_kick_maestro", "Free Kick Maestro"),
    ("tiki_taka_fan", "Tiki Taka Fan"),
    ("the_sweeper", "The Sweeper"),
    ("bicycle_kick", "Bicycle Kick"),
    ("ultras_norte", "Ultras Norte"),
    ("pressing_machine", "Pressing Machine"),
]


def create_simulated_users(db, num_users=5):
    users = []
    for i in range(min(num_users, len(FOOTBALL_USERNAMES))):
        username, display_name = FOOTBALL_USERNAMES[i]
        # Ensure uniqueness with a short suffix just in case
        unique_username = f"{username}_{uuid.uuid4().hex[:4]}"
        user = User(
            google_sub=f"sim_{uuid.uuid4()}",
            username=unique_username,
            email=f"{unique_username}@example.com",
            is_admin=False
        )
        db.add(user)
        users.append(user)
    db.commit()
    for u in users:
        db.refresh(u)
    return users


def simulate_predictions_for_user(db, user):
    print(f"Generating predictions for user {user.username}")

    matches = db.query(Match).order_by(Match.match_number).all()
    if not matches:
        print("Error: No matches found in database. Please seed the database first.")
        return

    group_matches = [m for m in matches if m.stage == "Group Stage"]
    knockout_matches = [m for m in matches if m.stage != "Group Stage"]

    # 1. Predict Group Stage
    for match in group_matches:
        home_score = random.randint(0, 4)
        away_score = random.randint(0, 4)

        pred = Prediction(
            user_id=user.id,
            match_id=match.id,
            predicted_home_score=home_score,
            predicted_away_score=away_score,
            predicted_home_team_id=match.home_team_id,
            predicted_away_team_id=match.away_team_id,
            penalty_winner_id=None
        )
        db.add(pred)
    db.commit()

    # 2. Predict Knockout Stages sequentially
    stages = ["Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Third-place", "Final"]

    for stage in stages:
        stage_matches = [m for m in knockout_matches if m.stage == stage]

        resolved = resolve_bracket_teams(db, user.id)
        match_num_map = {m.match_number: m for m in knockout_matches}
        match_id_to_num = {m.id: m.match_number for m in knockout_matches}

        preds = db.query(Prediction).filter(Prediction.user_id == user.id).all()
        user_preds = {p.match_id: p for p in preds}

        for match in stage_matches:
            home_slot = resolve_bracket_slot(match, "home", resolved, match_num_map, match_id_to_num, user_preds)
            away_slot = resolve_bracket_slot(match, "away", resolved, match_num_map, match_id_to_num, user_preds)

            p_home_id = home_slot.team.id if home_slot.team else None
            p_away_id = away_slot.team.id if away_slot.team else None

            home_score = random.randint(0, 4)
            away_score = random.randint(0, 4)
            penalty_winner_id = None

            if home_score == away_score:
                if random.choice([True, False]):
                    penalty_winner_id = p_home_id
                else:
                    penalty_winner_id = p_away_id

            pred = Prediction(
                user_id=user.id,
                match_id=match.id,
                predicted_home_score=home_score,
                predicted_away_score=away_score,
                predicted_home_team_id=p_home_id,
                predicted_away_team_id=p_away_id,
                penalty_winner_id=penalty_winner_id
            )
            db.add(pred)
        db.commit()


if __name__ == "__main__":
    db = SessionLocal()
    try:
        users = create_simulated_users(db, num_users=5)
        for user in users:
            simulate_predictions_for_user(db, user)
        print("Successfully generated simulated users and predictions.")
        
        print("Invalidating user brackets...")
        invalidate_user_brackets(db)
        
        print("Clearing cache...")
        user_cache.clear_all()
        
    except Exception as e:
        db.rollback()
        print(f"Error during simulation: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()