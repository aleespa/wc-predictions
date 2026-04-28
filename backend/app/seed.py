"""
Seed the database with all 48 World Cup 2026 teams and group-stage matches.
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from .models import Team, Match, User
from .auth import hash_password

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


def seed_database(db: Session):
    """Seed teams and group-stage matches if the DB is empty."""
    # Check if already seeded
    if db.query(Team).count() > 0:
        return

    # Create admin user
    admin = User(
        username="admin",
        hashed_password=hash_password("admin123"),
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

    # Generate group-stage matches
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

    db.commit()
    print(f"✅ Seeded {len(TEAMS)} teams and {match_number - 1} group-stage matches")
    print(f"✅ Admin user created (username: admin, password: admin123)")
