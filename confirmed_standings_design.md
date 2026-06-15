# Design Document: Low-Risk, Database-Free Group Standings & 3rd-Place Confirmation

This design details a mechanism allowing administrators to manually confirm/reorder team standings and select the 8 qualifying third-place teams at the end of the group stage, without modifying the database schema and without changing existing match, team, prediction, or score records.

The highest-priority requirement is safety: this feature must not perturb the database, must not risk existing user prediction data, and must not make the app unusable if the confirmation file is missing, invalid, or temporarily unreadable. The confirmation file is treated as a read-only overlay for bracket resolution and knockout unlock state.

Until an administrator explicitly confirms the standings, knockout predictions remain locked even if all group-stage matches are finished.

---

## Architectural Overview

The system stores official group-order and third-place qualifier decisions in a server-side JSON file. Backend routes read this file through one shared helper module. If the file is missing or invalid, the app falls back to the existing safe locked behavior for knockout predictions.

```mermaid
flowchart TD
    Match72[All Group Matches Finished] --> AdminUI[Admin UI: Confirm Standings Panel]
    AdminUI -->|Review Current Computed Standings| ReadAPI[GET /api/admin/confirmed-standings]
    AdminUI -->|Confirm Official Order| WriteAPI[POST /api/admin/confirm-standings]
    WriteAPI -->|Validate Payload| Validator[Server Validation]
    Validator -->|Atomic File Replace| File[(confirmed_group_standings.json)]
    File --> Helper[confirmed_standings Helper]
    Helper --> Predictions[Prediction Lock/Unlock]
    Helper --> Matches[/api/matches Confirmation State]
    Helper --> Bracket[/api/knockout/bracket Resolution]
    Helper --> Tables[/api/matches/standings and /api/matches/thirds]
```

Key principle: the JSON file does not mutate existing database rows. It only answers two questions:

1. Are knockout predictions officially unlocked?
2. What official group order and third-place qualifier set should bracket/standings displays use?

---

## 1. File-Based Storage

### Path

Use a configurable path so deployment can decide whether the file lives inside the app directory or on a mounted persistent volume:

```text
CONFIRMED_STANDINGS_PATH=/app/data/confirmed_group_standings.json
```

For local development, this may default to:

```text
backend/app/data/confirmed_group_standings.json
```

Production should mount this path persistently if confirmation state must survive container rebuilds.

### Structure

```json
{
  "is_confirmed": true,
  "confirmed_at": "2026-06-27T22:15:00Z",
  "confirmed_by_user_id": 1,
  "group_standings": {
    "A": [1, 2, 3, 4],
    "B": [5, 6, 7, 8],
    "C": [12, 10, 9, 11]
  },
  "qualifying_thirds": ["A", "B", "C", "D", "E", "F", "G", "I"]
}
```

Field behavior:

- `is_confirmed`: Boolean. If missing, false, or unreadable, knockout predictions stay locked.
- `confirmed_at`: Audit metadata only. It does not affect behavior.
- `confirmed_by_user_id`: Audit metadata only. It does not affect behavior.
- `group_standings`: Map of group letters to ordered `team_id` lists.
- `qualifying_thirds`: Exactly 8 group letters representing the official qualifying third-place teams.

### File Safety

The confirm endpoint must write safely:

- Validate the full payload before writing anything.
- Write to a temporary file first.
- Replace the target JSON atomically after the temp file is complete.
- If any error occurs, leave the previous confirmed file untouched.
- Never delete or alter match, prediction, team, or score rows.

---

## 2. Centralized Backend Helper

Add a shared helper module, for example:

```text
backend/app/confirmed_standings.py
```

This module should be the only place that reads, validates, and applies the confirmation JSON.

Suggested functions:

```python
def load_confirmed_standings() -> dict:
    """Return parsed confirmation data, or an unconfirmed empty state if unavailable."""

def is_bracket_unlocked() -> bool:
    """Return True only when the confirmation file exists and is_confirmed is true."""

def apply_confirmed_group_order(group_letter: str, standings: list[dict]) -> list[dict]:
    """Return standings sorted by official admin order when confirmed data is valid."""

def get_confirmed_qualifying_thirds() -> list[str]:
    """Return the official 8 third-place groups, or [] when unconfirmed."""
```

Important implementation detail: avoid long-lived in-memory caching for the file unless it checks file modification time. The backend runs multiple worker processes, so each process has its own memory cache. The safest first implementation is to read this small JSON file when needed.

---

## 3. Server-Side Validation

The admin confirm endpoint must reject invalid payloads instead of writing a bad file.

Validation rules:

- `group_standings` must include groups `A` through `L`.
- Each group must contain exactly 4 unique team IDs.
- Each team ID must belong to that group in the database.
- No team ID may appear in multiple groups.
- `qualifying_thirds` must contain exactly 8 unique group letters.
- Every qualifying third group must exist in `group_standings`.
- `is_confirmed` must be explicitly true for the locking state to change.
- The current database match results are read for validation/display only; they are not rewritten.

This avoids the risky `order.index(...)` failure mode where a missing or duplicate team ID could crash bracket resolution.

---

## 4. Backend Route Changes

### A. Prediction Route Protection

Modify `submit_prediction` in `backend/app/routers/predictions.py`.

Current behavior unlocks knockouts when all group matches are finished. Replace that first knockout-stage gate with the centralized helper:

```python
if match.stage != "Group Stage":
    if not is_bracket_unlocked():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Matches are locked until admin confirms group standings."
        )
```

Keep the existing source-match checks for Round of 16 and later. Admin confirmation should unlock Round of 32 only; later rounds should still require source knockout matches to finish.

### B. Match Confirmation State

Update `backend/app/routers/matches.py`.

The frontend uses `match.is_confirmed` from:

- `GET /api/matches`
- `GET /api/matches/{match_id}`

Both currently treat all group matches finished as enough to confirm knockout matches. They should instead use:

- Group-stage matches: confirmed as they are today.
- Round of 32: confirmed only when `is_bracket_unlocked()` is true.
- Round of 16 and later: confirmed only when the bracket is unlocked and each source knockout match is finished.

This keeps match cards, prediction pages, and backend submission rules aligned.

### C. Bracket Endpoint

Update `backend/app/routers/knockout.py`.

The bracket endpoint currently computes an unlock state but returns `is_unlocked=True` unconditionally. Replace this with the JSON-backed value:

```python
is_unlocked = is_bracket_unlocked()
```

Also pass this unlocked state into per-match confirmation logic so Round of 32 cards remain locked until admin confirmation.

### D. Bracket Resolution

Update `resolve_bracket_teams` in `backend/app/routers/knockout.py`.

For official bracket resolution (`user_id=None`) after confirmation:

1. Compute standings from actual group results as today.
2. Apply confirmed group order from the JSON.
3. Build first/second/third slots from the confirmed order.
4. Use `qualifying_thirds` from the JSON for the Annex C key.
5. Use the current `ANNEX_C_MAP` assignment to place the selected thirds.

For speculative user brackets (`user_id` provided) before confirmation:

- Keep the current blended/predicted behavior.
- Do not require the confirmation file.

For user brackets after confirmation:

- Prefer official confirmed group order for group results and third-place qualifiers.
- Continue using the user's knockout predictions for later-round speculative advancement where applicable.

### E. Standings and Third-Place Tables

Update the display endpoints in `backend/app/routers/matches.py`:

- `GET /api/matches/standings/{group_letter}`
- `GET /api/matches/thirds`

When confirmed data exists, the official public standings and third-place table should match the confirmed bracket. Without this, the bracket and standings pages can disagree.

For profile/community speculative standings, keep current behavior unless the view is explicitly meant to show official confirmed results.

### F. Admin Confirm Endpoints

Add two admin endpoints in `backend/app/routers/admin.py`:

```text
GET /api/admin/confirmed-standings
POST /api/admin/confirm-standings
```

`GET` should return:

- Current computed standings by group.
- Current computed third-place ranking.
- Existing confirmed JSON data if present.
- Whether the bracket is currently unlocked.

`POST` should:

- Validate the payload.
- Atomically write the JSON file.
- Clear local process caches where possible.
- Call `invalidate_user_brackets(db)` after successful confirmation.
- Return the saved confirmation state.

### G. Move Final Invalidation Trigger

Currently `set_match_result` in `backend/app/routers/admin.py` calls `invalidate_user_brackets(db)` automatically when the final group match is marked finished.

With this design, that final invalidation should move to the confirmation endpoint. Finishing Match 72 should make the admin panel available, but it should not persist official Round of 32 teams or invalidate knockout predictions until the admin confirms the final standings.

This is the safest behavior because it avoids committing bracket state before fair-play, drawing-of-lots, or manual tiebreaker decisions are resolved.

---

## 5. Frontend Admin Dashboard

Update `frontend/src/pages/admin.js`.

### Trigger Condition

Once all group-stage matches are finished, show a new panel:

```text
Confirm & Lock Group Standings
```

The panel should be visible only to admins.

### UI Features

Use low-risk, dependency-free controls that match the existing plain JavaScript admin page:

- One section per group.
- Each group shows four teams in the current computed order.
- Admin can reorder with up/down buttons or select position controls.
- A third-place section allows selecting exactly 8 groups.
- Disable submit until all validation conditions are satisfied.

Drag-and-drop is optional, but not required. Up/down controls are simpler and less likely to introduce frontend instability.

### Safety UI

Before submitting, show a confirmation modal:

```text
Locking standings will allow users to predict Round of 32 matches. This does not modify existing database match results or user predictions.
```

After saving:

- Refresh the admin page.
- Show the confirmed state.
- Make it clear that knockout predictions are now unlocked.

---

## 6. Cache and Multi-Worker Considerations

The app uses local in-memory caches:

- `timed_lru_cache`
- `user_cache`

These caches are per worker process. The backend Dockerfile runs Uvicorn with 4 workers, so clearing a cache in one worker does not clear all workers.

Recommended safe approach:

- Do not cache the confirmation file aggressively.
- Read the small JSON file directly, or use file modification time if caching later.
- Clear `user_cache` and relevant local caches after confirmation as a best-effort refresh.
- Rely on the JSON file as the source of truth across workers.

This keeps behavior correct even when some cached match lists live for a short time.

---

## 7. Deployment and Persistence

Because the confirmation file is runtime state, production deployment should ensure it survives app restarts/rebuilds.

Options:

1. Mount a persistent volume at the configured confirmation path.
2. Store the file beside other persistent operational files outside the container image.
3. If persistence is not configured, document that standings must be reconfirmed after a rebuild.

The design intentionally avoids database changes, but that means persistence must be handled at the file/deployment layer.

---

## 8. Failure Behavior

The app must fail safely:

- Missing file: knockouts locked.
- Invalid JSON: knockouts locked; log the error.
- Validation failure on POST: reject request; keep previous file.
- Partial write failure: previous file remains active.
- Cache staleness: at worst, a user sees old state briefly; backend prediction submission still checks the file.

No failure mode should delete or rewrite user predictions, match results, teams, or scores.

---

## 9. Verification Checklist

- Before admin confirmation, knockout prediction submission is rejected.
- Before admin confirmation, Round of 32 cards show as not confirmed.
- Finishing the final group match does not automatically persist R32 teams.
- Admin can fetch computed standings and confirm an official order.
- Invalid confirmation payloads are rejected without changing the file.
- After confirmation, Round of 32 prediction submission is accepted if the match has not started.
- Round of 16 and later remain locked until their source matches finish.
- Bracket, match cards, standings, and third-place table all agree.
- Confirmed third-place groups produce the expected Annex C mapping.
- Existing predictions and match results remain intact.
- App starts normally when the confirmation file is absent.

---

## Summary

This approach adds an official confirmation overlay without touching the database schema or rewriting existing user data. The confirmation JSON controls unlock state and official bracket seeding, while the database remains the source of truth for teams, matches, scores, and predictions.

The safest implementation path is to centralize all confirmation logic, validate aggressively before writing the file, write atomically, and update every route that currently uses "all groups finished" as the knockout unlock condition.
