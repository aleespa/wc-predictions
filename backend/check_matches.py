from app.database import engine
from app.models import Match
from sqlalchemy.orm import sessionmaker

Session = sessionmaker(bind=engine)
db = Session()

print(f"Total Matches: {db.query(Match).count()}")
stages = db.query(Match.stage).distinct().all()
print(f"Stages: {stages}")

db.close()
