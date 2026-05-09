import sys
import os
import random

# Add the parent directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Match, Prediction, User
from app.utils import calculate_points
from app.routers.admin import invalidate_user_brackets
from app.cache import user_cache

def simulate_admin_results(db, limit=71):
    print(f"Simulating admin results for the first {limit} matches...")
    
    # Get group stage matches ordered by match number or date
    matches = db.query(Match).filter(Match.stage == "Group Stage").order_by(Match.match_date, Match.id).all()
    
    to_process = matches[:limit]
    
    for i, match in enumerate(to_process):
        home_score = random.randint(0, 4)
        away_score = random.randint(0, 4)
        
        # In 2026 format, group matches don't have penalties
        penalty_winner_id = None
        
        print(f"[{i+1}/{limit}] Match {match.match_number}: {match.home_team.code if match.home_team else '??'} {home_score} - {away_score} {match.away_team.code if match.away_team else '??'}")
        
        match.home_score = home_score
        match.away_score = away_score
        match.is_finished = True
        match.penalty_winner_id = penalty_winner_id
        
        # Recalculate points for all predictions on this match
        predictions = db.query(Prediction).filter(Prediction.match_id == match.id).all()
        for pred in predictions:
            points = calculate_points(
                pred.predicted_home_score,
                pred.predicted_away_score,
                home_score,
                away_score,
                predicted_pen_winner=pred.penalty_winner_id,
                actual_pen_winner=penalty_winner_id,
                home_team_id=match.home_team_id,
                away_team_id=match.away_team_id,
                is_knockout=False
            )
            pred.points_awarded = points
            
        # Commit every few matches to avoid huge transactions
        if i % 10 == 0:
            db.commit()
            
    db.commit()
    print("Results committed.")
    
    # Clear cache
    user_cache.clear_all()
    print("Cache cleared.")

if __name__ == "__main__":
    db = SessionLocal()
    try:
        simulate_admin_results(db, limit=71)
        print("\nSuccessfully simulated 71 group stage match results.")
        print("Standings should now reflect these results.")
        print("Note: The 72nd match is still pending. Once you set it, R32 will generate.")
    except Exception as e:
        db.rollback()
        print(f"Error during simulation: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
