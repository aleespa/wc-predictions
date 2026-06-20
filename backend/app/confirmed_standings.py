"""
Confirmed group standings overlay.

A low-risk, database-free mechanism that lets an administrator confirm the
official end-of-group-stage standings and the 8 qualifying third-place groups.
The decision is stored in a single server-side JSON file and is treated as a
**read-only overlay** for bracket resolution and knockout unlock state.

Key principles:
  * It never mutates match, team, prediction, or score rows.
  * If the file is missing or invalid, the app falls back to the safe locked
    state (knockout predictions stay locked).
  * It is the single source of truth across all worker processes; it is read
    on demand (the file is tiny) rather than aggressively cached.

The file path is configurable via ``CONFIRMED_STANDINGS_PATH`` so deployments
can point it at a persistent volume; locally it defaults to a file under
``backend/app/data/``.
"""

import os
import json
import tempfile
import logging
from typing import Optional

logger = logging.getLogger("app.confirmed_standings")

GROUP_LETTERS = "ABCDEFGHIJKL"

_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "data", "confirmed_group_standings.json")


def get_path() -> str:
    return os.environ.get("CONFIRMED_STANDINGS_PATH", _DEFAULT_PATH)


def _empty_state() -> dict:
    return {"is_confirmed": False, "group_standings": {}, "qualifying_thirds": []}


def load_confirmed_standings() -> dict:
    """Return parsed confirmation data, or an unconfirmed empty state if unavailable."""
    path = get_path()
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            logger.warning("Confirmed standings file is not a JSON object; treating as unconfirmed.")
            return _empty_state()
        return data
    except FileNotFoundError:
        return _empty_state()
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to read confirmed standings file ({path}): {e}")
        return _empty_state()


def is_bracket_unlocked() -> bool:
    """Return True only when the confirmation file exists and is_confirmed is true."""
    return load_confirmed_standings().get("is_confirmed") is True


def get_confirmed_group_standings() -> dict:
    """Return the confirmed {group_letter: [team_id, ...]} map, or {} when unconfirmed."""
    data = load_confirmed_standings()
    if data.get("is_confirmed") is True:
        return data.get("group_standings") or {}
    return {}


def get_confirmed_qualifying_thirds() -> list:
    """Return the official 8 third-place group letters, or [] when unconfirmed."""
    data = load_confirmed_standings()
    if data.get("is_confirmed") is True:
        return list(data.get("qualifying_thirds") or [])
    return []


def apply_confirmed_group_order(group_letter: str, standings: list) -> list:
    """
    Return standings reordered to match the official admin order when confirmed
    data is valid. Teams not present in the confirmed order are appended last in
    their original relative order. If unconfirmed, the input is returned as-is.
    """
    order = get_confirmed_group_standings().get(group_letter.upper())
    if not order:
        return standings
    index = {team_id: i for i, team_id in enumerate(order)}
    return sorted(standings, key=lambda s: index.get(s.get("team_id"), len(order)))


def save_confirmed_standings(data: dict) -> None:
    """
    Atomically write the confirmation file: write to a temp file in the same
    directory, then replace the target. On any failure the previous file is
    left untouched.
    """
    path = get_path()
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".confirmed_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise


def validate_confirmation_payload(
    group_standings: dict,
    qualifying_thirds: list,
    team_group_map: dict,
) -> Optional[str]:
    """
    Validate a confirmation payload against the database team→group mapping.
    Returns an error message string if invalid, or None if valid.

    ``team_group_map`` maps team_id -> group_letter from the database.
    """
    if not isinstance(group_standings, dict):
        return "group_standings must be an object"

    seen_team_ids = set()
    for gl in GROUP_LETTERS:
        if gl not in group_standings:
            return f"Missing group {gl}"
        ids = group_standings[gl]
        if not isinstance(ids, list) or len(ids) != 4:
            return f"Group {gl} must contain exactly 4 team IDs"
        if len(set(ids)) != 4:
            return f"Group {gl} contains duplicate team IDs"
        for tid in ids:
            if team_group_map.get(tid) != gl:
                return f"Team {tid} does not belong to group {gl}"
            if tid in seen_team_ids:
                return f"Team {tid} appears in multiple groups"
            seen_team_ids.add(tid)

    if not isinstance(qualifying_thirds, list) or len(qualifying_thirds) != 8:
        return "qualifying_thirds must contain exactly 8 group letters"
    if len(set(qualifying_thirds)) != 8:
        return "qualifying_thirds contains duplicate group letters"
    for g in qualifying_thirds:
        if g not in group_standings:
            return f"Qualifying third group {g} is not a valid group"

    return None
