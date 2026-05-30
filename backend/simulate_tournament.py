import sys
import os
import random
import uuid

# Add the parent directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import func, desc
from app.database import SessionLocal
from app.models import User, Match, Prediction, Team, Community, user_community
from app.routers.knockout import resolve_bracket_teams, resolve_bracket_slot
from app.routers.admin import propagate_knockout_results, invalidate_user_brackets
from app.cache import user_cache
from app.utils import calculate_points, compute_standings
from app.seed import seed_database

# Curated soccer-themed usernames for 20 simulated users
USERNAMES = [
    "striker_star",
    "midfield_magic",
    "goalkeeper_wall",
    "tiki_taka_pro",
    "defense_rock",
    "var_critic",
    "penalty_king",
    "golden_boot_hunter",
    "pitch_maestro",
    "injury_time_hero",
    "bicycle_kick_ace",
    "offside_trap_master",
    "nutmeg_ninja",
    "corner_flag_dancer",
    "clean_sheet_king",
    "super_sub_flyer",
    "false_nine_expert",
    "header_powerhouse",
    "counter_attack_pro",
    "top_bins_finisher"
]


def reset_database(db):
    print("--------------------------------------------------------------------------------")
    print(" Resetting database and seeding if needed...")
    print("--------------------------------------------------------------------------------")
    
    # 1. Seed teams and matches if they aren't loaded yet
    if db.query(Team).count() == 0:
        print("Teams not seeded. Seeding now...")
        seed_database(db)
    
    # 2. Delete all existing predictions, communities, and user-community links
    db.query(Prediction).delete()
    db.execute(user_community.delete())
    db.query(Community).delete()
    
    # 3. Delete all users to ensure exactly our 20 simulated users are created
    db.query(User).delete()
    
    # 4. Reset all matches: set is_finished to False, scores and penalty winners to None.
    # For knockout matches, home_team_id and away_team_id must also be set to None.
    matches = db.query(Match).all()
    for m in matches:
        m.home_score = None
        m.away_score = None
        m.penalty_winner_id = None
        m.is_finished = False
        if m.stage != "Group Stage":
            m.home_team_id = None
            m.away_team_id = None
            
    db.commit()
    print("Database cleared of all users, predictions, and communities.")
    print("Match states and knockout seeding reset to fresh initial states.")


def create_users_and_community(db):
    print("\n--------------------------------------------------------------------------------")
    print(" Creating 20 simulated users and a community league...")
    print("--------------------------------------------------------------------------------")
    
    # Create the users
    users = []
    for username in USERNAMES:
        user = User(
            google_sub=f"sim_{uuid.uuid4().hex[:12]}",
            username=username,
            email=f"{username}@example.com",
            is_admin=False
        )
        db.add(user)
        users.append(user)
    db.commit()
    
    for u in users:
        db.refresh(u)
        
    print(f"Created 10 users: {', '.join(USERNAMES)}")
    
    # Create a simulation community league
    community = Community(
        name="Antigravity Simulated Tournament League",
        invite_code="SIMULATE2026",
        creator_id=users[0].id
    )
    db.add(community)
    db.commit()
    db.refresh(community)
    
    # Add all users as members of the community
    community.members.extend(users)
    db.commit()
    print(f"Created Community League '{community.name}' with all 10 users joined.")
    
    return users


def get_random_score():
    # Return realistic football scores using weighted probabilities
    return random.choices([0, 1, 2, 3, 4], weights=[0.2, 0.4, 0.25, 0.1, 0.05])[0]


def simulate_group_stage_predictions(db, users):
    print("\n--------------------------------------------------------------------------------")
    print(" 1. Users predict all 72 Group Stage matches...")
    print("--------------------------------------------------------------------------------")
    
    group_matches = db.query(Match).filter(Match.stage == "Group Stage").order_by(Match.match_number).all()
    
    prediction_records = []
    for user in users:
        for match in group_matches:
            pred_home = get_random_score()
            pred_away = get_random_score()
            
            pred = Prediction(
                user_id=user.id,
                match_id=match.id,
                predicted_home_score=pred_home,
                predicted_away_score=pred_away,
                predicted_home_team_id=match.home_team_id,
                predicted_away_team_id=match.away_team_id,
                penalty_winner_id=None
            )
            db.add(pred)
            prediction_records.append(pred)
            
    db.commit()
    print(f"Success: Created {len(prediction_records)} Group Stage predictions (72 matches x 10 users).")


def simulate_group_stage_results(db):
    print("\n--------------------------------------------------------------------------------")
    print(" 2. Admin enters results for the 72 Group Stage matches...")
    print("--------------------------------------------------------------------------------")
    
    group_matches = db.query(Match).filter(Match.stage == "Group Stage").order_by(Match.match_number).all()
    
    for i, match in enumerate(group_matches):
        actual_home = get_random_score()
        actual_away = get_random_score()
        
        match.home_score = actual_home
        match.away_score = actual_away
        match.is_finished = True
        match.penalty_winner_id = None
        
        # Calculate points for all user predictions on this match
        predictions = db.query(Prediction).filter(Prediction.match_id == match.id).all()
        for pred in predictions:
            points = calculate_points(
                pred.predicted_home_score,
                pred.predicted_away_score,
                actual_home,
                actual_away,
                predicted_pen_winner=None,
                actual_pen_winner=None,
                home_team_id=match.home_team_id,
                away_team_id=match.away_team_id,
                stage=match.stage
            )
            pred.points_awarded = points
            
        if (i + 1) % 18 == 0 or (i + 1) == 72:
            print(f"Processed match {match.match_number}/72: {match.home_team.code} {actual_home} - {actual_away} {match.away_team.code}")
            
    db.commit()
    print("\nAll 72 Group Stage matches have been resolved.")
    
    # Invalidate and propagate. This will calculate the official group standings and seed the official R32 matchups.
    print("Triggering official bracket resolution pass...")
    invalidate_user_brackets(db)
    user_cache.clear_all()
    
    # Display the final group standings for one representative group (e.g. Group A)
    print("\nOfficial Standings for Group A (calculated dynamically):")
    teams_a = db.query(Team).filter(Team.group_letter == "A").all()
    matches_a = db.query(Match).filter(Match.group_letter == "A").all()
    standings_a = compute_standings(teams_a, matches_a, lambda m: (m.home_score, m.away_score, False))
    print(f"{'Team':<12} | {'P':<2} | {'W':<2} | {'D':<2} | {'L':<2} | {'GD':<3} | {'Pts':<3}")
    for row in standings_a:
        print(f"{row['team_name']:<12} | {row['played']:<2} | {row['won']:<2} | {row['drawn']:<2} | {row['lost']:<2} | {row['goal_diff']:+3} | {row['points']:<3}")


def simulate_knockout_stage(db, users, stage_name):
    print(f"\n--------------------------------------------------------------------------------")
    print(f" SIMULATING STAGE: {stage_name}")
    print(f"--------------------------------------------------------------------------------")
    
    # 1. Fetch knockout matches and build lookup maps
    knockout_matches = db.query(Match).filter(Match.stage != "Group Stage").order_by(Match.match_number).all()
    stage_matches = [m for m in knockout_matches if m.stage == stage_name]
    
    match_num_map = {m.match_number: m for m in knockout_matches}
    match_id_to_num = {m.id: m.match_number for m in knockout_matches}
    
    # 2. Users predict matches for this stage based on their speculative brackets
    print(f"-> Generating speculative bracket predictions for {stage_name} (10 users)...")
    prediction_count = 0
    for user in users:
        resolved = resolve_bracket_teams(db, user.id)
        
        # Get all predictions made by this user so far to pass into resolve_bracket_slot
        preds = db.query(Prediction).filter(Prediction.user_id == user.id).all()
        user_preds = {p.match_id: p for p in preds}
        
        for match in stage_matches:
            # Resolve speculative home/away teams for the user's bracket
            home_slot = resolve_bracket_slot(match, "home", resolved, match_num_map, match_id_to_num, user_preds)
            away_slot = resolve_bracket_slot(match, "away", resolved, match_num_map, match_id_to_num, user_preds)
            
            p_home_id = home_slot.team.id if home_slot.team else None
            p_away_id = away_slot.team.id if away_slot.team else None
            
            pred_home = get_random_score()
            pred_away = get_random_score()
            penalty_winner_id = None
            
            # Since knockout matches cannot end in a draw, if predicted scores are even, predict a penalty winner
            if pred_home == pred_away:
                if p_home_id and p_away_id:
                    penalty_winner_id = random.choice([p_home_id, p_away_id])
                elif p_home_id:
                    penalty_winner_id = p_home_id
                elif p_away_id:
                    penalty_winner_id = p_away_id
            
            pred = Prediction(
                user_id=user.id,
                match_id=match.id,
                predicted_home_score=pred_home,
                predicted_away_score=pred_away,
                predicted_home_team_id=p_home_id,
                predicted_away_team_id=p_away_id,
                penalty_winner_id=penalty_winner_id
            )
            db.add(pred)
            prediction_count += 1
            
    db.commit()
    print(f"Generated {prediction_count} predictions for {stage_name}.")
    
    # 3. Admin enters actual scores and propagates winners to next rounds
    print(f"\n-> Admin enters actual match results and propagates winners for {stage_name}...")
    for match in stage_matches:
        h_id = match.home_team_id
        a_id = match.away_team_id
        
        # If teams are not officially populated yet (failsafe), resolve them officially
        if not h_id or not a_id:
            real_resolved = resolve_bracket_teams(db, user_id=None)
            off_h = resolve_bracket_slot(match, "home", real_resolved, match_num_map, match_id_to_num, {})
            off_a = resolve_bracket_slot(match, "away", real_resolved, match_num_map, match_id_to_num, {})
            if off_h.team:
                match.home_team_id = off_h.team.id
                h_id = off_h.team.id
            if off_a.team:
                match.away_team_id = off_a.team.id
                a_id = off_a.team.id
                
        actual_home = get_random_score()
        actual_away = get_random_score()
        penalty_winner_id = None
        
        # A knockout match must resolve to a winner. If score is a draw, pick penalty winner randomly
        if actual_home == actual_away:
            if h_id and a_id:
                penalty_winner_id = random.choice([h_id, a_id])
            elif h_id:
                penalty_winner_id = h_id
            elif a_id:
                penalty_winner_id = a_id
                
        match.home_score = actual_home
        match.away_score = actual_away
        match.penalty_winner_id = penalty_winner_id
        match.is_finished = True
        
        db.commit() # Save match state so point checks query correctly
        
        # Calculate points for all predictions on this match
        predictions = db.query(Prediction).filter(Prediction.match_id == match.id).all()
        for pred in predictions:
            points = calculate_points(
                pred.predicted_home_score,
                pred.predicted_away_score,
                actual_home,
                actual_away,
                predicted_pen_winner=pred.penalty_winner_id,
                actual_pen_winner=penalty_winner_id,
                home_team_id=match.home_team_id,
                away_team_id=match.away_team_id,
                stage=match.stage
            )
            
            pred.points_awarded = points
            
        db.commit()
        
        # Propagate result to next bracket dependencies
        propagate_knockout_results(db, match)
        
        # Print match results
        home_code = match.home_team.code if match.home_team else "???"
        away_code = match.away_team.code if match.away_team else "???"
        pk_info = ""
        if penalty_winner_id:
            pk_team = db.query(Team).filter(Team.id == penalty_winner_id).first()
            pk_info = f" (PK Winner: {pk_team.code})"
            
        print(f"Match {match.match_number}: {home_code} {actual_home} - {actual_away} {away_code}{pk_info}")
        
    # Re-run invalidation to recalculate users' speculative bracket trees with new official outcomes
    invalidate_user_brackets(db)
    user_cache.clear_all()


def show_final_leaderboard(db):
    print("\n================================================================================")
    print(" TOURNAMENT FINISHED! FINAL LEADERBOARD")
    print("================================================================================")
    
    # Query total points awarded to each user
    results = db.query(
        User.username,
        func.sum(Prediction.points_awarded).label("total_points")
    ).join(Prediction).group_by(User.id).order_by(desc("total_points")).all()
    
    print(f"{'Rank':<4} | {'Username':<22} | {'Total Points':<12}")
    print("-" * 50)
    for rank, row in enumerate(results, 1):
        suffix = " (WINNER)" if rank == 1 else ""
        print(f"#{rank:<3} | {row.username:<22} | {row.total_points:<12} {suffix}")
        
    print("\nDetailed point statistics per user:")
    print(f"{'Username':<22} | {'Exact Scores':<12} | {'Outcome Only':<12} | {'Total Points':<12}")
    print("-" * 70)
    
    for username in USERNAMES:
        user = db.query(User).filter(User.username == username).first()
        preds = db.query(Prediction).filter(Prediction.user_id == user.id).all()
        
        exact_scores = 0
        outcome_only = 0
        bracket_bonuses = 0
        total_pts = 0
        
        for p in preds:
            pts = p.points_awarded or 0
            total_pts += pts
            match = p.match
            
            if not match.stage == "Group Stage":
                # For knockout, check if they got bracket bonus (+5 points)
                actual_teams = {match.home_team_id, match.away_team_id}
                predicted_teams = {p.predicted_home_team_id, p.predicted_away_team_id}
                got_bracket_bonus = (actual_teams == predicted_teams and None not in actual_teams and None not in predicted_teams)
                if got_bracket_bonus:
                    bracket_bonuses += 1
                    pts -= 5
                
                # Check outcome point remaining
                if pts > 0:
                    outcome_only += 1  # Standard correct advancer
            else:
                # Group stage
                if pts == 5:
                    exact_scores += 1
                elif pts in [1, 3]:
                    outcome_only += 1
                    
        print(f"{username:<22} | {exact_scores:<12} | {outcome_only:<12} | {total_pts:<12}")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        print("*** STARTING FULL WORLD CUP TOURNAMENT SIMULATION ***\n")
        
        # 1. Reset
        reset_database(db)
        
        # 2. Setup
        users = create_users_and_community(db)
        
        # 3. Predict Group Stage
        simulate_group_stage_predictions(db, users)
        
        # 4. Resolve Group Stage
        simulate_group_stage_results(db)
        
        # 5. Knockout Stages (sequential)
        knockout_stages = [
            "Round of 32",
            "Round of 16",
            "Quarter-finals",
            "Semi-finals",
            "Third-place",
            "Final"
        ]
        
        for stage in knockout_stages:
            simulate_knockout_stage(db, users, stage)
            
        # 6. Show leaderboard
        show_final_leaderboard(db)
        
        print("\nTournament simulation completed successfully! All match outcomes, predictions, and score calculations match real database states.")
        
    except Exception as e:
        db.rollback()
        print(f"\nError during simulation: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
