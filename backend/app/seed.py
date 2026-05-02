"""
Seed the database with all 48 World Cup 2026 teams, group-stage matches,
and the full knockout bracket template (R32 → Final) according to official 
FIFA scheduling and accurate regional venue zoning.
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from .models import Team, Match, User

TEAMS = [
    # Group A (Mexico Host Group)
    ("Mexico", "MEX", "A", "🇲🇽"),
    ("South Africa", "RSA", "A", "🇿🇦"),
    ("South Korea", "KOR", "A", "🇰🇷"),
    ("Czechia", "CZE", "A", "🇨🇿"),
    # Group B (Canada Host Group)
    ("Canada", "CAN", "B", "🇨🇦"),
    ("Switzerland", "SUI", "B", "🇨🇭"),
    ("Qatar", "QAT", "B", "🇶🇦"),
    ("Bosnia & Herzegovina", "BIH", "B", "🇧🇦"),
    # Group C (East Region)
    ("Brazil", "BRA", "C", "🇧🇷"),
    ("Morocco", "MAR", "C", "🇲🇦"),
    ("Haiti", "HAI", "C", "🇭🇹"),
    ("Scotland", "SCO", "C", "🏴\U000e0067\U000e0062\U000e0073\U000e0063\U000e0074\U000e007f"),
    # Group D (USA Host Group - West Coast)
    ("USA", "USA", "D", "🇺🇸"),
    ("Paraguay", "PAR", "D", "🇵🇾"),
    ("Australia", "AUS", "D", "🇦🇺"),
    ("Türkiye", "TUR", "D", "🇹🇷"),
    # Group E (Central Region)
    ("Germany", "GER", "E", "🇩🇪"),
    ("Curaçao", "CUW", "E", "🇨🇼"),
    ("Côte d'Ivoire", "CIV", "E", "🇨🇮"),
    ("Ecuador", "ECU", "E", "🇪🇨"),
    # Group F (Central Region)
    ("Netherlands", "NED", "F", "🇳🇱"),
    ("Japan", "JPN", "F", "🇯🇵"),
    ("Tunisia", "TUN", "F", "🇹🇳"),
    ("Sweden", "SWE", "F", "🇸🇪"),
    # Group G (East Region)
    ("Belgium", "BEL", "G", "🇧🇪"),
    ("Egypt", "EGY", "G", "🇪🇬"),
    ("Iran", "IRN", "G", "🇮🇷"),
    ("New Zealand", "NZL", "G", "🇳🇿"),
    # Group H (West Region)
    ("Spain", "ESP", "H", "🇪🇸"),
    ("Cabo Verde", "CPV", "H", "🇨🇻"),
    ("Saudi Arabia", "KSA", "H", "🇸🇦"),
    ("Uruguay", "URU", "H", "🇺🇾"),
    # Group I (East Region)
    ("France", "FRA", "I", "🇫🇷"),
    ("Senegal", "SEN", "I", "🇸🇳"),
    ("Norway", "NOR", "I", "🇳🇴"),
    ("Iraq", "IRQ", "I", "🇮🇶"),
    # Group J (Central Region)
    ("Argentina", "ARG", "J", "🇦🇷"),
    ("Algeria", "ALG", "J", "🇩🇿"),
    ("Austria", "AUT", "J", "🇦🇹"),
    ("Jordan", "JOR", "J", "🇯🇴"),
    # Group K (Central Region)
    ("Portugal", "POR", "K", "🇵🇹"),
    ("Colombia", "COL", "K", "🇨🇴"),
    ("Uzbekistan", "UZB", "K", "🇺🇿"),
    ("DR Congo", "COD", "K", "🇨🇩"),
    # Group L (East Region)
    ("England", "ENG", "L", "🏴\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f"),
    ("Croatia", "CRO", "L", "🇭🇷"),
    ("Ghana", "GHA", "L", "🇬🇭"),
    ("Panama", "PAN", "L", "🇵🇦"),
]

# Group stage: June 11 – June 27, 2026 (16 day offset span)
GROUP_SCHEDULE = {
    "A": (0, 7, 13), "B": (1, 7, 13), "C": (2, 8, 14),
    "D": (2, 8, 14), "E": (3, 9, 15), "F": (3, 9, 15),
    "G": (4, 10, 16), "H": (4, 10, 16), "I": (5, 11, 16),
    "J": (5, 11, 16), "K": (6, 12, 16), "L": (6, 12, 16),
}

# Accurate Geographic Zoning for Group Stages
GROUP_VENUES = {
    "A": ["Estadio Azteca, Mexico City", "Estadio Akron, Guadalajara", "Estadio BBVA, Monterrey"],
    "B": ["BMO Field, Toronto", "BC Place, Vancouver"],
    "C": ["Gillette Stadium, Boston", "Lincoln Financial Field, Philadelphia"],
    "D": ["SoFi Stadium, Los Angeles", "Lumen Field, Seattle"],
    "E": ["NRG Stadium, Houston", "AT&T Stadium, Dallas"],
    "F": ["Arrowhead Stadium, Kansas City", "Mercedes-Benz Stadium, Atlanta"],
    "G": ["MetLife Stadium, New York/New Jersey", "Hard Rock Stadium, Miami"],
    "H": ["Levi's Stadium, San Francisco", "SoFi Stadium, Los Angeles"],
    "I": ["Gillette Stadium, Boston", "MetLife Stadium, New York/New Jersey"],
    "J": ["Arrowhead Stadium, Kansas City", "AT&T Stadium, Dallas"],
    "K": ["NRG Stadium, Houston", "Mercedes-Benz Stadium, Atlanta"],
    "L": ["Hard Rock Stadium, Miami", "Lincoln Financial Field, Philadelphia"],
}

MATCH_TIMES = [(15, 0), (18, 0)]
BASE_DATE = datetime(2026, 6, 11, tzinfo=timezone.utc)

# ══════════════════════════════════════════════════════
# KNOCKOUT BRACKET — FIFA Official 2026 Format
# ══════════════════════════════════════════════════════
KNOCKOUT_ROUND_OF_32 = [
    (73, "2A", "2B",     (2026, 6, 28, 15, 0), "SoFi Stadium, Los Angeles"),
    (74, "1E", "3ABCDF", (2026, 6, 29, 15, 0), "Gillette Stadium, Boston"),
    (75, "1F", "2C",     (2026, 6, 29, 18, 0), "Estadio BBVA, Monterrey"),
    (76, "1C", "2F",     (2026, 6, 29, 21, 0), "NRG Stadium, Houston"),
    (77, "1I", "3CDFGH", (2026, 6, 30, 15, 0), "MetLife Stadium, New York/New Jersey"),
    (78, "2E", "2I",     (2026, 6, 30, 18, 0), "AT&T Stadium, Dallas"),
    (79, "1A", "3CEFHI", (2026, 6, 30, 21, 0), "Estadio Azteca, Mexico City"),
    (80, "1L", "3EHIJK", (2026, 7, 1, 15, 0),  "Mercedes-Benz Stadium, Atlanta"),
    (81, "1D", "3BEFIJ", (2026, 7, 1, 18, 0),  "Levi's Stadium, San Francisco"),
    (82, "1G", "3AEHIJ", (2026, 7, 1, 21, 0),  "Lumen Field, Seattle"),
    (83, "2K", "2L",     (2026, 7, 2, 15, 0),  "BMO Field, Toronto"),
    (84, "1H", "2J",     (2026, 7, 2, 18, 0),  "SoFi Stadium, Los Angeles"),
    (85, "1B", "3EFGIJ", (2026, 7, 2, 21, 0),  "BC Place, Vancouver"),
    (86, "1J", "2H",     (2026, 7, 3, 15, 0),  "Hard Rock Stadium, Miami"),
    (87, "1K", "3DEIJL", (2026, 7, 3, 18, 0),  "Arrowhead Stadium, Kansas City"),
    (88, "2D", "2G",     (2026, 7, 3, 21, 0),  "AT&T Stadium, Dallas"),
]

KNOCKOUT_ROUND_OF_16 = [
    (89, 74, 77, (2026, 7, 4, 15, 0),  "Lincoln Financial Field, Philadelphia"),
    (90, 73, 75, (2026, 7, 4, 18, 0),  "NRG Stadium, Houston"),
    (91, 76, 78, (2026, 7, 5, 15, 0),  "MetLife Stadium, New York/New Jersey"),
    (92, 79, 80, (2026, 7, 5, 18, 0),  "Estadio Azteca, Mexico City"),
    (93, 83, 84, (2026, 7, 6, 15, 0),  "AT&T Stadium, Dallas"),
    (94, 81, 82, (2026, 7, 6, 18, 0),  "Lumen Field, Seattle"),
    (95, 86, 88, (2026, 7, 7, 15, 0),  "Mercedes-Benz Stadium, Atlanta"),
    (96, 85, 87, (2026, 7, 7, 18, 0),  "BC Place, Vancouver"),
]

KNOCKOUT_QUARTER_FINALS = [
    (97, 89, 90, (2026, 7, 9, 15, 0),  "Gillette Stadium, Boston"),
    (98, 93, 94, (2026, 7, 10, 18, 0), "SoFi Stadium, Los Angeles"),
    (99, 91, 92, (2026, 7, 11, 15, 0), "Hard Rock Stadium, Miami"),
    (100, 95, 96, (2026, 7, 11, 18, 0), "Arrowhead Stadium, Kansas City"),
]

KNOCKOUT_SEMI_FINALS = [
    (101, 97, 98, (2026, 7, 14, 18, 0), "AT&T Stadium, Dallas"),
    (102, 99, 100, (2026, 7, 15, 18, 0), "Mercedes-Benz Stadium, Atlanta"),
]

KNOCKOUT_FINAL_MATCHES = [
    (103, 101, 102, (2026, 7, 18, 18, 0), "Hard Rock Stadium, Miami"),
    (104, 101, 102, (2026, 7, 19, 19, 0), "MetLife Stadium, New York/New Jersey"),
]

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
    if db.query(Team).count() > 0:
        return

    admin = User(
        clerk_id="admin_placeholder_id",
        username="admin",
        display_name="Administrator",
        is_admin=True,
    )
    db.add(admin)

    team_map = {}
    for name, code, group, flag in TEAMS:
        team = Team(name=name, code=code, group_letter=group, flag_emoji=flag)
        db.add(team)
        db.flush()
        team_map[code] = team

    # ── Generate group-stage matches with localized venues ──
    match_number = 1

    for group_letter in "ABCDEFGHIJKL":
        group_teams = [t for t in TEAMS if t[2] == group_letter]
        codes = [t[1] for t in group_teams]
        schedule = GROUP_SCHEDULE[group_letter]
        
        # Pull the specific stadiums assigned to this group's region
        stadiums = GROUP_VENUES[group_letter]
        venue_idx = 0

        pairings_by_md = [
            [(codes[0], codes[1]), (codes[2], codes[3])],
            [(codes[0], codes[2]), (codes[1], codes[3])],
            [(codes[0], codes[3]), (codes[1], codes[2])],
        ]

        for md_idx, (day_offset, pairs) in enumerate(zip(schedule, pairings_by_md)):
            for game_idx, (home_code, away_code) in enumerate(pairs):
                hour, minute = MATCH_TIMES[game_idx]
                match_dt = BASE_DATE.replace(
                    day=BASE_DATE.day + day_offset,
                    hour=hour,
                    minute=minute,
                )
                
                # Cycle through the group's localized stadiums
                venue = stadiums[venue_idx % len(stadiums)]
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
    match_num_to_id = {}

    for mnum, home_slot, away_slot, dt_tuple, venue in KNOCKOUT_ROUND_OF_32:
        match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
        match = Match(stage="Round of 32", match_number=mnum, match_date=match_dt, venue=venue, home_slot=home_slot, away_slot=away_slot)
        db.add(match)
        db.flush()
        match_num_to_id[mnum] = match.id

    for mnum, home_src, away_src, dt_tuple, venue in KNOCKOUT_ROUND_OF_16:
        match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
        match = Match(stage="Round of 16", match_number=mnum, match_date=match_dt, venue=venue, home_slot=f"W{home_src}", away_slot=f"W{away_src}", home_source_match_id=match_num_to_id[home_src], away_source_match_id=match_num_to_id[away_src])
        db.add(match)
        db.flush()
        match_num_to_id[mnum] = match.id

    for mnum, home_src, away_src, dt_tuple, venue in KNOCKOUT_QUARTER_FINALS:
        match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
        match = Match(stage="Quarter-finals", match_number=mnum, match_date=match_dt, venue=venue, home_slot=f"W{home_src}", away_slot=f"W{away_src}", home_source_match_id=match_num_to_id[home_src], away_source_match_id=match_num_to_id[away_src])
        db.add(match)
        db.flush()
        match_num_to_id[mnum] = match.id

    for mnum, home_src, away_src, dt_tuple, venue in KNOCKOUT_SEMI_FINALS:
        match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
        match = Match(stage="Semi-finals", match_number=mnum, match_date=match_dt, venue=venue, home_slot=f"W{home_src}", away_slot=f"W{away_src}", home_source_match_id=match_num_to_id[home_src], away_source_match_id=match_num_to_id[away_src])
        db.add(match)
        db.flush()
        match_num_to_id[mnum] = match.id

    mnum, home_src, away_src, dt_tuple, venue = KNOCKOUT_FINAL_MATCHES[0]
    match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
    match = Match(stage="Third-place", match_number=mnum, match_date=match_dt, venue=venue, home_slot=f"L{home_src}", away_slot=f"L{away_src}", home_source_match_id=match_num_to_id[home_src], away_source_match_id=match_num_to_id[away_src])
    db.add(match)
    db.flush()
    match_num_to_id[mnum] = match.id

    mnum, home_src, away_src, dt_tuple, venue = KNOCKOUT_FINAL_MATCHES[1]
    match_dt = datetime(*dt_tuple, tzinfo=timezone.utc)
    match = Match(stage="Final", match_number=mnum, match_date=match_dt, venue=venue, home_slot=f"W{home_src}", away_slot=f"W{away_src}", home_source_match_id=match_num_to_id[home_src], away_source_match_id=match_num_to_id[away_src])
    db.add(match)
    db.flush()
    match_num_to_id[mnum] = match.id

    db.commit()
    print(f"Seeded {len(TEAMS)} teams and 72 group-stage matches across accurate regional zones.")
    print(f"Seeded 32 knockout bracket matches (R32 through Final).")