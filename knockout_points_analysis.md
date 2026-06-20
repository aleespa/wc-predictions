# 🏆 Knockout Stages Points Allocation Analysis

This document outlines the design and implementation of the points allocation rules for the knockout stages in the World Cup predictions application.

---

## 📊 1. Overview of Points by Stage

Points are awarded based on the prediction's precision and increase as the tournament progresses to reflect the higher stakes of later stages.

The points matrix for each stage is defined in [get_stage_points](file:///C:/Users/Alejandro/Projects/wc-predictions/backend/app/utils.py#L3-L15) inside [utils.py](file:///C:/Users/Alejandro/Projects/wc-predictions/backend/app/utils.py):

| Stage | Exact Score | Result + Goal Difference (GD) | Correct Outcome |
| :--- | :---: | :---: | :---: |
| **Group Stage** | 3 | 2 | 1 |
| **Round of 32** | 6 | 4 | 2 |
| **Round of 16** | 10 | 7 | 4 |
| **Quarter-finals** | 12 | 8 | 4 |
| **Semi-finals** | 16 | 12 | 5 |
| **Third-place** | 16 | 12 | 5 |
| **Final** | 25 | 20 | 15 |

---

## 🔒 2. Knockout-Specific Rule: The "Advancer" Condition

Unlike the Group Stage (where matches can end in a draw), knockout matches require one team to advance to the next round. The points calculation in [calculate_points_detail](file:///C:/Users/Alejandro/Projects/wc-predictions/backend/app/utils.py#L18-L76) enforces a strict **"Advancer Rule"** first:

```python
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
```

### Key Behaviors:
* **Advance Prediction is Mandatory:** A user must correctly predict the advancing team to get any points.
* **Immediate Zero Points:** If the user predicted Team A to advance, but Team B actually advanced, the user receives **0 points** immediately.
* **Penalty Shootout Resolution:** If a user predicts a draw (e.g. 1-1) for a knockout match, they must specify a `predicted_pen_winner`. If they fail to predict the correct team that won the penalty shootout, their `p_advancer` won't match `a_advancer`, resulting in **0 points**.

---

## 🎯 3. Precision Tiers

If the user correctly predicted the advancing team, the system evaluates their scoreline prediction:

1. **Exact Score:**
   * The predicted home and away goals match the actual goals (e.g., predicted `2-1`, actual `2-1`).
   * For knockout games ending in a draw (e.g. `1-1`), this also requires predicting the correct penalty shootout winner (due to the advancer check).
2. **Result + Goal Difference:**
   * The predicted outcome (Win/Loss/Draw) matches the actual outcome, and the goal difference is identical (e.g., predicted `3-1` [GD = +2], actual `2-0` [GD = +2]).
3. **Correct Outcome:**
   * The predicted outcome (Win/Loss/Draw) matches, but neither the exact score nor the goal difference matches (e.g., predicted `2-1` [outcome: Home Win], actual `3-0` [outcome: Home Win]).

---

## ⚠️ 4. Frontend vs. Backend Discrepancy

There is a mismatch for the **Round of 16** scoring values between the backend implementation and frontend UI table documentation:

* **Backend Implementation** ([utils.py](file:///C:/Users/Alejandro/Projects/wc-predictions/backend/app/utils.py#L8)):
  ```python
  "Round of 16": (10, 7, 4)
  ```
  *(Awards 10 points for exact match, 7 for GD, 4 for outcome)*
* **Frontend Home Page UI** ([home.js](file:///C:/Users/Alejandro/Projects/wc-predictions/frontend/src/pages/home.js#L91-L95)):
  ```html
  <td style="padding: 8px; text-align: left; color: var(--text-muted);">${t('matches_filter_r16')}</td>
  <td style="padding: 8px; font-weight: 700;">8</td>
  <td style="padding: 8px; font-weight: 700;">6</td>
  <td style="padding: 8px; font-weight: 700;">3</td>
  ```
  *(Displays 8 points for exact match, 6 for GD, 3 for outcome)*

This means players will actually receive more points for the Round of 16 than the homepage states. All other stages are consistent.
