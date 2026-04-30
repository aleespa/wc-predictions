"""
Seed the database with all 48 World Cup 2026 teams, group-stage matches,
and the full knockout bracket template (R32 → Final).
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from .models import Team, Match, User

TEAMS = [
    # Group A
    ("Mexico", "MEX", "A", "🇲🇽"),
    ("South Africa", "RSA", "A", "🇿🇦"),
    ("South Korea", "KOR", "A", "🇰🇷"),
    ("Czechia", "CZE", "A", "🇨🇿"),
    # Group B
    ("Canada", "CAN", "B", "🇨🇦"),
    ("Switzerland", "SUI", "B", "🇨🇭"),
    ("Qatar", "QAT", "B", "🇶🇦"),
    ("Bosnia & Herzegovina", "BIH", "B", "🇧🇦"),
    # Group C
    ("Brazil", "BRA", "C", "🇧🇷"),
    ("Morocco", "MAR", "C", "🇲🇦"),
    ("Haiti", "HAI", "C", "🇭🇹"),
    ("Scotland", "SCO", "C", "🏴\U000e0067\U000e0062\U000e0073\U000e0063\U000e0074\U000e007f"),
    # Group D
    ("USA", "USA", "D", "🇺🇸"),
    ("Paraguay", "PAR", "D", "🇵🇾"),
    ("Australia", "AUS", "D", "🇦🇺"),
    ("Türkiye", "TUR", "D", "🇹🇷"),
    # Group E
    ("Germany", "GER", "E", "🇩🇪"),
    ("Curaçao", "CUW", "E", "🇨🇼"),
    ("Côte d'Ivoire", "CIV", "E", "🇨🇮"),
    ("Ecuador", "ECU", "E", "🇪🇨"),
    # Group F
    ("Netherlands", "NED", "F", "🇳🇱"),
    ("Japan", "JPN", "F", "🇯🇵"),
    ("Tunisia", "TUN", "F", "🇹🇳"),
    ("Sweden", "SWE", "F", "🇸🇪"),
    # Group G
    ("Belgium", "BEL", "G", "🇧🇪"),
    ("Egypt", "EGY", "G", "🇪🇬"),
    ("Iran", "IRN", "G", "🇮🇷"),
    ("New Zealand", "NZL", "G", "🇳🇿"),
    # Group H
    ("Spain", "ESP", "H", "🇪🇸"),
    ("Cabo Verde", "CPV", "H", "🇨🇻"),
    ("Saudi Arabia", "KSA", "H", "🇸🇦"),
    ("Uruguay", "URU", "H", "🇺🇾"),
    # Group I
    ("France", "FRA", "I", "🇫🇷"),
    ("Senegal", "SEN", "I", "🇸🇳"),
    ("Norway", "NOR", "I", "🇳🇴"),
    ("Iraq", "IRQ", "I", "🇮🇶"),
    # Group J
    ("Argentina", "ARG", "J", "🇦🇷"),
    ("Algeria", "ALG", "J", "🇩🇿"),
    ("Austria", "AUT", "J", "🇦🇹"),
    ("Jordan", "JOR", "J", "🇯🇴"),
    # Group K
    ("Portugal", "POR", "K", "🇵🇹"),
    ("Colombia", "COL", "K", "🇨🇴"),
    ("Uzbekistan", "UZB", "K", "🇺🇿"),
    ("DR Congo", "COD", "K", "🇨🇩"),
    # Group L
    ("England", "ENG", "L", "🏴\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f"),
    ("Croatia", "CRO", "L", "🇭🇷"),
    ("Ghana", "GHA", "L", "🇬🇭"),
    ("Panama", "PAN", "L", "🇵🇦"),
]

# Group stage: June 11 – June 27, 2026
# Each group has 6 matches (round-robin of 4 teams)
# 3 matchdays per group, spread across the window
GROUP_SCHEDULE = {
    # (day_offset_md1, day_offset_md2, day_offset_md3)
    "A": (0, 4, 8),
    "B": (0, 4, 8),
    "C": (1, 5, 9),
    "D": (1, 5, 9),
    "E": (2, 6, 10),
    "F": (2, 6, 10),
    "G": (3, 7, 11),
    "H": (3, 7, 11),
    "I": (4, 8, 12),
    "J": (4, 8, 12),
    "K": (5, 9, 13),
    "L": (5, 9, 13),
}

# Match times (UTC) for the 2 games per matchday in a group
MATCH_TIMES = [
    (15, 0),  # 15:00 UTC
    (18, 0),  # 18:00 UTC
]

BASE_DATE = datetime(2026, 6, 11, tzinfo=timezone.utc)

VENUES = [
    "MetLife Stadium, New York/New Jersey",
    "AT&T Stadium, Dallas",
    "SoFi Stadium, Los Angeles",
    "Hard Rock Stadium, Miami",
    "Estadio Azteca, Mexico City",
    "Lumen Field, Seattle",
    "NRG Stadium, Houston",
    "Mercedes-Benz Stadium, Atlanta",
    "Lincoln Financial Field, Philadelphia",
    "BC Place, Vancouver",
    "Arrowhead Stadium, Kansas City",
    "BMO Field, Toronto",
    "Estadio BBVA, Monterrey",
    "Estadio Akron, Guadalajara",
    "Gillette Stadium, Boston",
    "Levi's Stadium, San Francisco",
]

# ══════════════════════════════════════════════════════
# KNOCKOUT BRACKET — FIFA Official 2026 Format
# ══════════════════════════════════════════════════════
# Slot notation:
#   "1X" = Winner of Group X
#   "2X" = Runner-up of Group X
#   "3XXXXX" = Best 3rd place from those groups
#   For R16+: filled by source match winners
#
# Dates: R32 = June 28-July 2, R16 = July 3-6, QF = July 7-8,
#         SF = July 11-12, 3rd Place = July 14, Final = July 15

KNOCKOUT_ROUND_OF_32 = [
    # (match_number, home_slot, away_slot, date, time_utc, venue)
    (73, "2A", "2B",     (2026, 6, 28, 15, 0), "MetLife Stadium, New York/New Jersey"),
    (74, "1E", "3ABCDF", (2026, 6, 28, 18, 0), "AT&T Stadium, Dallas"),
    (75, "1F", "2C",     (2026, 6, 28, 21, 0), "SoFi Stadium, Los Angeles"),
    (76, "1C", "2F",     (2026, 6, 29, 15, 0), "Hard Rock Stadium, Miami"),
    (77, "2E", "2I",     (2026, 6, 29, 18, 0), "Estadio Azteca, Mexico City"),
    (78, "1I", "3CDFGH", (2026, 6, 29, 21, 0), "Lumen Field, Seattle"),
    (79, "1A", "3CEFHI", (2026, 6, 30, 15, 0), "NRG Stadium, Houston"),
    (80, "1L", "3EHIJK", (2026, 6, 30, 18, 0), "Mercedes-Benz Stadium, Atlanta"),
    (81, "1D", "3BEFIJ", (2026, 6, 30, 21, 0), "Lincoln Financial Field, Philadelphia"),
    (82, "1G", "3AEHIJ", (2026, 7, 1, 15, 0),  "BC Place, Vancouver"),
    (83, "2K", "2L",     (2026, 7, 1, 18, 0),  "Arrowhead Stadium, Kansas City"),
    (84, "1H", "2J",     (2026, 7, 1, 21, 0),  "BMO Field, Toronto"),
    (85, "1B", "3EFGIJ", (2026, 7, 2, 15, 0),  "Estadio BBVA, Monterrey"),
    (86, "1J", "2H",     (2026, 7, 2, 18, 0),  "Estadio Akron, Guadalajara"),
    (87, "1K", "3DEIJL", (2026, 7, 2, 21, 0),  "Gillette Stadium, Boston"),
    (88, "2D", "2G",     (2026, 7, 2, 21, 0),  "Levi's Stadium, San Francisco"),
]

# Round of 16: Winners of R32 matches feed in
# Format: (match_number, home_source_match, away_source_match, date, venue)
KNOCKOUT_ROUND_OF_16 = [
    (89, 73, 74, (2026, 7, 3, 15, 0),  "MetLife Stadium, New York/New Jersey"),
    (90, 75, 76, (2026, 7, 3, 18, 0),  "AT&T Stadium, Dallas"),
    (91, 77, 78, (2026, 7, 3, 21, 0),  "SoFi Stadium, Los Angeles"),
    (92, 79, 80, (2026, 7, 4, 15, 0),  "Hard Rock Stadium, Miami"),
    (93, 81, 82, (2026, 7, 4, 18, 0),  "Estadio Azteca, Mexico City"),
    (94, 83, 84, (2026, 7, 4, 21, 0),  "Lumen Field, Seattle"),
    (95, 85, 86, (2026, 7, 5, 15, 0),  "NRG Stadium, Houston"),
    (96, 87, 88, (2026, 7, 5, 18, 0),  "Mercedes-Benz Stadium, Atlanta"),
]

# Quarter-finals
KNOCKOUT_QUARTER_FINALS = [
    (97, 89, 90, (2026, 7, 7, 15, 0),  "MetLife Stadium, New York/New Jersey"),
    (98, 91, 92, (2026, 7, 7, 18, 0),  "AT&T Stadium, Dallas"),
    (99, 93, 94, (2026, 7, 8, 15, 0),  "SoFi Stadium, Los Angeles"),
    (100, 95, 96, (2026, 7, 8, 18, 0), "Hard Rock Stadium, Miami"),
]

# Semi-finals
KNOCKOUT_SEMI_FINALS = [
    (101, 97, 98, (2026, 7, 11, 18, 0), "MetLife Stadium, New York/New Jersey"),
    (102, 99, 100, (2026, 7, 12, 18, 0), "AT&T Stadium, Dallas"),
]

# Third place & Final
KNOCKOUT_FINAL_MATCHES = [
    (103, 101, 102, (2026, 7, 14, 18, 0), "Estadio Azteca, Mexico City"),     # 3rd place (losers of SFs)
    (104, 101, 102, (2026, 7, 15, 18, 0), "MetLife Stadium, New York/New Jersey"),  # Final (winners of SFs)
]


# Human-readable labels for bracket slots
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
    """Seed teams, group-stage matches, and knockout bracket template if the DB is empty."""
    # Check if already seeded
    if db.query(Team).count() > 0:
        return

    # Create admin user
    admin = User(
        clerk_id="admin_placeholder_id",
        username="admin",
        display_name="Administrator",
        is_admin=True,
    )
    db.add(admin)

    # Seed teams
    team_map = {}  # code -> Team
    for name, code, group, flag in TEAMS:
        team = Team(name=name, code=code, group_letter=group, flag_emoji=flag)
        db.add(team)
        db.flush()
        team_map[code] = team

    # ── Generate group-stage matches ──
    match_number = 1
    venue_idx = 0

    for group_letter in "ABCDEFGHIJKL":
        group_teams = [t for t in TEAMS if t[2] == group_letter]
        codes = [t[1] for t in group_teams]
        schedule = GROUP_SCHEDULE[group_letter]

        # Round-robin pairings for 4 teams:
        # MD1: 1v2, 3v4  |  MD2: 1v3, 2v4  |  MD3: 1v4, 2v3
        pairings_by_md = [
            [(codes[0], codes[1]), (codes[2], codes[3])],  # Matchday 1
            [(codes[0], codes[2]), (codes[1], codes[3])],  # Matchday 2
            [(codes[0], codes[3]), (codes[1], codes[2])],  # Matchday 3
        ]

        for md_idx, (day_offset, pairs) in enumerate(zip(schedule, pairings_by_md)):
            for game_idx, (home_code, away_code) in enumerate(pairs):
                hour, minute = MATCH_TIMES[game_idx]
                match_dt = BASE_DATE.replace(
                    day=BASE_DATE.day + day_offset,
                    hour=hour,
                    minute=minute,
                )
                venue = VENUES[venue_idx % len(VENUES)]
                venue_idx += 1

                match = Match(
                    group_letter=group_letter,
                    stage="Group Stage",
                    match_number=match_number,
                    home_team_id=team_map[home_code].id,
                    away_team_id=team_map[away_code].id,
                    match_date=match_dt,
                    venue=venue,
                )
                db.add(match)
                match_number += 1

    db.flush()

    # ── Generate knockout bracket matches ──
    # We need to map match_number -> match.id for source references
    match_num_to_id = {}

    # Round of 32
    for mnum, home_slot, away_slot, dt_tuple, venue in KNOCKOUT_ROUND_OF_32:
        match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
        match = Match(
            stage="Round of 32",
            match_number=mnum,
            home_team_id=None,
            away_team_id=None,
            match_date=match_dt,
            venue=venue,
            home_slot=home_slot,
            away_slot=away_slot,
        )
        db.add(match)
        db.flush()
        match_num_to_id[mnum] = match.id

    # Round of 16
    for mnum, home_src, away_src, dt_tuple, venue in KNOCKOUT_ROUND_OF_16:
        match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
        match = Match(
            stage="Round of 16",
            match_number=mnum,
            home_team_id=None,
            away_team_id=None,
            match_date=match_dt,
            venue=venue,
            home_slot=f"W{home_src}",
            away_slot=f"W{away_src}",
            home_source_match_id=match_num_to_id[home_src],
            away_source_match_id=match_num_to_id[away_src],
        )
        db.add(match)
        db.flush()
        match_num_to_id[mnum] = match.id

    # Quarter-finals
    for mnum, home_src, away_src, dt_tuple, venue in KNOCKOUT_QUARTER_FINALS:
        match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
        match = Match(
            stage="Quarter-finals",
            match_number=mnum,
            home_team_id=None,
            away_team_id=None,
            match_date=match_dt,
            venue=venue,
            home_slot=f"W{home_src}",
            away_slot=f"W{away_src}",
            home_source_match_id=match_num_to_id[home_src],
            away_source_match_id=match_num_to_id[away_src],
        )
        db.add(match)
        db.flush()
        match_num_to_id[mnum] = match.id

    # Semi-finals
    for mnum, home_src, away_src, dt_tuple, venue in KNOCKOUT_SEMI_FINALS:
        match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
        match = Match(
            stage="Semi-finals",
            match_number=mnum,
            home_team_id=None,
            away_team_id=None,
            match_date=match_dt,
            venue=venue,
            home_slot=f"W{home_src}",
            away_slot=f"W{away_src}",
            home_source_match_id=match_num_to_id[home_src],
            away_source_match_id=match_num_to_id[away_src],
        )
        db.add(match)
        db.flush()
        match_num_to_id[mnum] = match.id

    # Third place (match 103) — losers of semi-finals
    mnum, home_src, away_src, dt_tuple, venue = KNOCKOUT_FINAL_MATCHES[0]
    match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
    match = Match(
        stage="Third-place",
        match_number=mnum,
        home_team_id=None,
        away_team_id=None,
        match_date=match_dt,
        venue=venue,
        home_slot=f"L{home_src}",
        away_slot=f"L{away_src}",
        home_source_match_id=match_num_to_id[home_src],
        away_source_match_id=match_num_to_id[away_src],
    )
    db.add(match)
    db.flush()
    match_num_to_id[mnum] = match.id

    # Final (match 104) — winners of semi-finals
    mnum, home_src, away_src, dt_tuple, venue = KNOCKOUT_FINAL_MATCHES[1]
    match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
    match = Match(
        stage="Final",
        match_number=mnum,
        home_team_id=None,
        away_team_id=None,
        match_date=match_dt,
        venue=venue,
        home_slot=f"W{home_src}",
        away_slot=f"W{away_src}",
        home_source_match_id=match_num_to_id[home_src],
        away_source_match_id=match_num_to_id[away_src],
    )
    db.add(match)
    db.flush()
    match_num_to_id[mnum] = match.id

    db.commit()
    print(f"Seeded {len(TEAMS)} teams and 72 group-stage matches")
    print(f"Seeded 32 knockout bracket matches (R32 through Final)")
    print(f"Admin user created (ID: admin_placeholder_id)")
