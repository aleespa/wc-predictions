import os

SECRET_KEY = os.getenv("SECRET_KEY", "worldcup2026-super-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1 week

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./worldcup.db")
