from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, SessionLocal, Base
from .routers import users, matches, predictions, leaderboard, admin
from . import models  # noqa - ensure models are imported for table creation

app = FastAPI(
    title="World Cup 2026 Predictions",
    description="Predict FIFA World Cup 2026 match results and compete on the leaderboard!",
    version="1.0.0",
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router)
app.include_router(matches.router)
app.include_router(predictions.router)
app.include_router(leaderboard.router)
app.include_router(admin.router)


@app.on_event("startup")
def on_startup():
    # Tables are created by Alembic migrations in Docker

    # Seed data
    from .seed import seed_database
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "World Cup 2026 Predictions"}
