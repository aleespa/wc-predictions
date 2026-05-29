import sys
import os
import csv
import random
import uuid
from datetime import datetime, timezone
from sqlalchemy import func, desc

# Add the parent directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User, Match, Prediction, Team
from app.routers.knockout import invalidate_single_user_bracket
from app.cache import user_cache

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FIFA_RANKINGS_CSV = os.path.join(BASE_DIR, "app", "data", "fifa_rankings.csv")


def load_fifa_rankings():
    """Load FIFA rankings from the CSV file."""
    if not os.path.exists(FIFA_RANKINGS_CSV):
        print(f"Error: {FIFA_RANKINGS_CSV} not found! Ranking predictions will fall back to defaults.")
        return {}
    
    rankings = {}
    with open(FIFA_RANKINGS_CSV, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rankings[row["code"]] = int(row["rank"])
    return rankings


def get_or_create_user(db, username):
    """Retrieve existing user or register a new simulated user."""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = User(
            google_sub=f"sim_active_{username}_{uuid.uuid4().hex[:6]}",
            username=username,
            email=f"{username}@example.com",
            is_admin=False
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Created simulated user: {username}")
    else:
        print(f"Found existing user: {username}")
    return user


def is_group_stage_finished(db):
    """Check if all group stage matches are finished in the DB."""
    group_total = db.query(Match).filter(Match.stage == "Group Stage").count()
    group_finished = db.query(Match).filter(Match.stage == "Group Stage", Match.is_finished == True).count()
    return group_total == group_finished and group_total > 0


def is_match_predictable(db, match, all_groups_done):
    """
    Determine if a match is open for prediction.
    Matches are open if they have not started, are not finished,
    and have their playing teams officially populated/confirmed.
    """
    if match.is_finished:
        return False
        
    # Check if match has already started
    now = datetime.now(timezone.utc)
    match_dt = match.match_date
    if isinstance(match_dt, str):
        match_dt = datetime.fromisoformat(match_dt)
    if match_dt.tzinfo is None:
        match_dt = match_dt.replace(tzinfo=timezone.utc)
        
    if match_dt <= now:
        return False
        
    # Knockout stage specific checks
    if match.stage != "Group Stage":
        if not all_groups_done:
            return False
            
        # Knockout matches must have both playing teams officially resolved and set
        if not match.home_team_id or not match.away_team_id:
            return False
            
        # Ensure source feeding matches (if any) are already finished
        src_ids = [match.home_source_match_id, match.away_source_match_id]
        if any(src_ids):
            src_matches = db.query(Match).filter(Match.id.in_([sid for sid in src_ids if sid])).all()
            if not all(sm.is_finished for sm in src_matches):
                return False
                
    return True


def predict_fifa_standing(home_team, away_team, fifa_rankings, is_knockout):
    """
    Deterministic/Logical prediction based on the team's FIFA ranking.
    - Close rankings (diff <= 5): predicts 1-1 (better-ranked team wins penalties)
    - Small difference (diff <= 15): favorite wins 2-1
    - Medium difference (diff <= 30): favorite wins 2-0
    - Large difference (diff > 30): favorite wins 3-0
    """
    rank_home = fifa_rankings.get(home_team.code, 99)
    rank_away = fifa_rankings.get(away_team.code, 99)
    
    diff = rank_away - rank_home  # positive if home has better rank (numerically smaller number)
    abs_diff = abs(diff)
    
    if abs_diff <= 5:
        # Match is a draw
        pred_home = 1
        pred_away = 1
        penalty_winner_id = home_team.id if rank_home < rank_away else away_team.id
    elif abs_diff <= 15:
        if diff > 0:
            pred_home = 2
            pred_away = 1
        else:
            pred_home = 1
            pred_away = 2
        penalty_winner_id = None
    elif abs_diff <= 30:
        if diff > 0:
            pred_home = 2
            pred_away = 0
        else:
            pred_home = 0
            pred_away = 2
        penalty_winner_id = None
    else:
        if diff > 0:
            pred_home = 3
            pred_away = 0
        else:
            pred_home = 0
            pred_away = 3
        penalty_winner_id = None
        
    # Penalty winner is only valid in knockout stages
    penalty_winner_id = penalty_winner_id if is_knockout else None
    return pred_home, pred_away, penalty_winner_id


def generate_predictions(db, random_user, fifa_user, fifa_rankings):
    print("\n--- Identifying Predictable Matches ---")
    
    matches = db.query(Match).order_by(Match.match_number).all()
    all_groups_done = is_group_stage_finished(db)
    
    predictable_matches = []
    for m in matches:
        if is_match_predictable(db, m, all_groups_done):
            predictable_matches.append(m)
            
    if not predictable_matches:
        print("No matches are currently available to be predicted (all matches might be locked, started, or finished).")
        return
        
    print(f"Found {len(predictable_matches)} matches currently available for prediction.")
    
    # Track additions for console reports
    random_count = 0
    fifa_count = 0
    
    for match in predictable_matches:
        is_ko = (match.stage != "Group Stage")
        home_team = match.home_team
        away_team = match.away_team
        
        home_code = home_team.code if home_team else "???"
        away_code = away_team.code if away_team else "???"
        
        # 1. Random User Prediction
        rand_pred = db.query(Prediction).filter(
            Prediction.user_id == random_user.id,
            Prediction.match_id == match.id
        ).first()
        
        if not rand_pred:
            pred_home = random.choices([0, 1, 2, 3, 4], weights=[0.2, 0.4, 0.25, 0.1, 0.05])[0]
            pred_away = random.choices([0, 1, 2, 3, 4], weights=[0.2, 0.4, 0.25, 0.1, 0.05])[0]
            penalty_winner_id = None
            
            if is_ko and pred_home == pred_away:
                penalty_winner_id = random.choice([match.home_team_id, match.away_team_id])
                
            rand_pred = Prediction(
                user_id=random_user.id,
                match_id=match.id,
                predicted_home_score=pred_home,
                predicted_away_score=pred_away,
                predicted_home_team_id=match.home_team_id,
                predicted_away_team_id=match.away_team_id,
                penalty_winner_id=penalty_winner_id
            )
            db.add(rand_pred)
            random_count += 1
            
            pk_info = f" (PK Winner: {db.query(Team).get(penalty_winner_id).code})" if penalty_winner_id else ""
            print(f"[RANDOM] Predicted Match {match.match_number} ({match.stage}): {home_code} {pred_home} - {pred_away} {away_code}{pk_info}")
        
        # 2. FIFA Standing User Prediction
        fifa_pred = db.query(Prediction).filter(
            Prediction.user_id == fifa_user.id,
            Prediction.match_id == match.id
        ).first()
        
        if not fifa_pred:
            pred_home, pred_away, penalty_winner_id = predict_fifa_standing(
                home_team, away_team, fifa_rankings, is_ko
            )
            
            fifa_pred = Prediction(
                user_id=fifa_user.id,
                match_id=match.id,
                predicted_home_score=pred_home,
                predicted_away_score=pred_away,
                predicted_home_team_id=match.home_team_id,
                predicted_away_team_id=match.away_team_id,
                penalty_winner_id=penalty_winner_id
            )
            db.add(fifa_pred)
            fifa_count += 1
            
            pk_info = f" (PK Winner: {db.query(Team).get(penalty_winner_id).code})" if penalty_winner_id else ""
            h_rank = fifa_rankings.get(home_code, "unranked")
            a_rank = fifa_rankings.get(away_code, "unranked")
            print(f"[FIFA]   Predicted Match {match.match_number} ({match.stage}) [Ranks: {home_code}(#{h_rank}) vs {away_code}(#{a_rank})]: {home_code} {pred_home} - {pred_away} {away_code}{pk_info}")

    db.commit()
    
    # Refresh bracket invalidation so speculative slots update
    if random_count > 0:
        invalidate_single_user_bracket(db, random_user.id)
    if fifa_count > 0:
        invalidate_single_user_bracket(db, fifa_user.id)
        
    user_cache.clear_all()
    print(f"\nSimulation complete: Added {random_count} new predictions for user 'random' and {fifa_count} new predictions for user 'fifa_standing'.")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        print("*** STARTING UNLOCKED MATCH PREDICTOR SIMULATION ***\n")
        
        # Load ranks
        fifa_rankings = load_fifa_rankings()
        print(f"Loaded {len(fifa_rankings)} team rankings successfully.")
        
        # Load or create users
        random_user = get_or_create_user(db, "random")
        fifa_user = get_or_create_user(db, "fifa_standing")
        
        # Run
        generate_predictions(db, random_user, fifa_user, fifa_rankings)
        
    except Exception as e:
        db.rollback()
        print(f"\nError during simulation: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
