from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, SessionLocal, Base
from .routers import users, matches, predictions, leaderboard, admin, knockout, community
from . import models  # noqa - ensure models are imported for table creation

app = FastAPI(
    title="World Cup 2026 Predictions",
    description="Predict FIFA World Cup 2026 match results and compete on the leaderboard!",
    version="1.0.0",
)

import os

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
app.include_router(knockout.router)
app.include_router(community.router)


@app.on_event("startup")
def on_startup():
    # Create tables (safe to run multiple times — only creates if missing)
    Base.metadata.create_all(bind=engine)

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
