from typing import Optional, Callable, Dict, Any, List

def calculate_points(
    predicted_home: int,
    predicted_away: int,
    actual_home: int,
    actual_away: int,
    predicted_pen_winner: Optional[int] = None,
    actual_pen_winner: Optional[int] = None,
    home_team_id: Optional[int] = None,
    away_team_id: Optional[int] = None,
    is_knockout: bool = False,
) -> int:
    """Calculate points for a prediction."""
    def get_advancer(h_score, a_score, pen_winner, h_id, a_id):
        if h_score > a_score: return h_id
        if a_score > h_score: return a_id
        return pen_winner

    if not is_knockout:
        if predicted_home == actual_home and predicted_away == actual_away:
            return 5
            
        def outcome(h, a):
            if h > a: return "home"
            if a > h: return "away"
            return "draw"
            
        if outcome(predicted_home, predicted_away) == outcome(actual_home, actual_away):
            if (predicted_home - predicted_away) == (actual_home - actual_away):
                return 3
            return 1
        return 0
    else:
        p_advancer = get_advancer(predicted_home, predicted_away, predicted_pen_winner, home_team_id, away_team_id)
        a_advancer = get_advancer(actual_home, actual_away, actual_pen_winner, home_team_id, away_team_id)
        
        if p_advancer != a_advancer or p_advancer is None:
            return 0
            
        points = 1
        p_penalties = (predicted_home == predicted_away)
        a_penalties = (actual_home == actual_away)
        
        if p_penalties and a_penalties:
            points = 3
            if predicted_pen_winner == actual_pen_winner and actual_pen_winner is not None:
                points = 5
                
        return points


def compute_standings(teams: List[Any], matches: List[Any], get_scores_fn: Callable[[Any], Optional[tuple[int, int, bool]]]) -> List[Dict[str, Any]]:
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
