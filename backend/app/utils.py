from typing import Optional, Callable, Dict, Any, List

def get_stage_points(stage: str) -> tuple[int, int, int]:
    """Get the points awarded for a stage: (Exact Score, Result + GD, Correct Outcome)"""
    POINTS_MAP = {
        "Group Stage":       (3,  2,  1),
        "Round of 32":       (6,  4,  2),
        "Round of 16":       (10, 7,  4),
        "Quarter-finals":    (12, 8,  4),
        "Semi-finals":       (16, 12, 5),
        "Third Place Match": (16, 12, 5),
        "Final":             (25, 20, 15),
    }

    stage_key = stage
    if "Third" in stage:                      stage_key = "Third Place Match"
    elif "Semi" in stage:                     stage_key = "Semi-finals"
    elif "Quarter" in stage or stage == "R8": stage_key = "Quarter-finals"
    elif stage in ("Round of 8", "R16"):      stage_key = "Round of 16"
    elif stage == "R32":                      stage_key = "Round of 32"
    elif "Final" in stage:                    stage_key = "Final"

    return POINTS_MAP.get(stage_key, (3, 2, 1))


def calculate_points_detail(
    predicted_home: int,
    predicted_away: int,
    actual_home: int,
    actual_away: int,
    predicted_pen_winner: Optional[int] = None,
    actual_pen_winner: Optional[int] = None,
    home_team_id: Optional[int] = None,
    away_team_id: Optional[int] = None,
    stage: str = "Group Stage",
) -> tuple[int, bool, bool]:
    """
    Calculate points and return details.
    Returns (points, is_exact, is_correct_outcome)
    """
    pts_exact, pts_gd, pts_outcome = get_stage_points(stage)

    is_knockout = stage not in ["Group Stage"]
    if "Quarter" in stage or "Semi" in stage or "Third" in stage or "Final" in stage or "Round of" in stage:
        if "Group" not in stage:
            is_knockout = True

    def outcome(h, a):
        if h > a: return "home"
        if a > h: return "away"
        return "draw"

    # For knockout matches, we must first check if they correctly predicted who advances
    if is_knockout:
        def get_advancer(h_score, a_score, pen_winner, h_id, a_id):
            if h_score > a_score: return h_id
            if a_score > h_score: return a_id
            return pen_winner

        p_advancer = get_advancer(predicted_home, predicted_away, predicted_pen_winner, home_team_id, away_team_id)
        a_advancer = get_advancer(actual_home, actual_away, actual_pen_winner, home_team_id, away_team_id)
        
        if p_advancer != a_advancer or p_advancer is None:
            return 0, False, False

    # Correct Outcome
    if outcome(predicted_home, predicted_away) == outcome(actual_home, actual_away):
        # Exact Score
        if predicted_home == actual_home and predicted_away == actual_away:
            # For knockout, if it went to penalties, we check if they predicted the penalty winner too
            if is_knockout and predicted_home == predicted_away:
                if predicted_pen_winner == actual_pen_winner and actual_pen_winner is not None:
                    return pts_exact, True, True
                else:
                    return pts_exact, True, True
            return pts_exact, True, True
        
        # Result + Goal Diff
        if (predicted_home - predicted_away) == (actual_home - actual_away):
            return pts_gd, False, True
            
        return pts_outcome, False, True
        
    return 0, False, False


def calculate_points(
    predicted_home: int,
    predicted_away: int,
    actual_home: int,
    actual_away: int,
    predicted_pen_winner: Optional[int] = None,
    actual_pen_winner: Optional[int] = None,
    home_team_id: Optional[int] = None,
    away_team_id: Optional[int] = None,
    stage: str = "Group Stage",
) -> int:
    """Calculate points for a prediction based on the tournament stage."""
    pts, _, _ = calculate_points_detail(
        predicted_home, predicted_away, actual_home, actual_away,
        predicted_pen_winner, actual_pen_winner, home_team_id, away_team_id, stage
    )
    return pts


def compute_standings(teams: List[Any], matches: List[Any], get_scores_fn: Callable) -> List[Dict[str, Any]]:
    """
    Generic standings calculator.
    get_scores_fn(match) should return (home_score, away_score) or None.
    """
    std_map = {
        t.id: {
            "team_id": t.id,
            "team_name": t.name,
            "team_code": t.code,
            "flag_emoji": t.flag_emoji,
            "played": 0, "won": 0, "drawn": 0, "lost": 0,
            "goals_for": 0, "goals_against": 0, "goal_diff": 0, "points": 0,
            "is_predicted": False
        }
        for t in teams
    }

    for m in matches:
        if m.home_team_id not in std_map or m.away_team_id not in std_map:
            continue
            
        scores = get_scores_fn(m)
        if not scores:
            continue
            
        h_score, a_score, is_predicted = scores
        
        home = std_map[m.home_team_id]
        away = std_map[m.away_team_id]

        home["is_predicted"] = home["is_predicted"] or is_predicted
        away["is_predicted"] = away["is_predicted"] or is_predicted

        home["played"] += 1
        away["played"] += 1
        home["goals_for"] += h_score
        home["goals_against"] += a_score
        away["goals_for"] += a_score
        away["goals_against"] += h_score

        if h_score > a_score:
            home["won"] += 1
            home["points"] += 3
            away["lost"] += 1
        elif h_score < a_score:
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
    standings.sort(
        key=lambda x: (x["points"], x["goal_diff"], x["goals_for"]),
        reverse=True,
    )
    return standings
