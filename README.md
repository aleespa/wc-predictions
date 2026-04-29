# 🏆 World Cup 2026 Predictions Dashboard

A high-performance, full-stack web application built to predict, track, and manage matches for the FIFA World Cup 2026. Designed with a premium glassmorphic UI, dynamic knockout bracket generation, and a fully decoupled backend architecture.

## ⚡ Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.13)
- **Database**: PostgreSQL via Docker
- **Authentication**: Clerk Backend SDK (JWT validation & session management)
- **Package Manager**: `uv` (Fast Python package installer and resolver)
- **Migrations**: Alembic

### Frontend
- **Framework**: Vanilla JS + Vite
- **Authentication**: Clerk Frontend SDK (@clerk/clerk-js)
- **Styling**: Pure CSS (Modern Glassmorphism, CSS Variables, Flexbox/Grid)
- **Icons/Visuals**: SVGs hosted via CDN (FlagCDN)

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Web Server / Reverse Proxy**: NGINX

---

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Docker** and **Docker Compose**
- **Clerk Account**: You will need a Clerk application to handle authentication.

---

## 🔐 Environment Variables

The application requires specific environment variables to connect with your Clerk instance and configure the PostgreSQL database.

Copy `.env.example` to `.env` in the root directory and populate it with your Clerk API keys and database credentials:

```env
POSTGRES_USER=admin
POSTGRES_PASSWORD=admin
POSTGRES_DB=wc_db
DATABASE_URL=postgresql://admin:admin@db:5432/wc_db
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🚀 How to Run the Project locally

The application is fully containerized using Docker Compose. A bridge network securely connects the PostgreSQL database, FastAPI backend, Vite frontend, and NGINX reverse proxy.

### 1. Start the Docker Cluster

Ensure Docker is running, then execute the following command at the project root:

```bash
docker compose up -d --build
```

*Note: The first time the backend boots, Alembic will apply database migrations, and the backend will automatically execute `seed.py` to populate the PostgreSQL database with all 48 World Cup teams and the 72 group-stage fixtures.*

### 2. Access the Application

The frontend and API are both cleanly served via the NGINX proxy on port 80:
- **Web App:** `http://localhost/`
- **Backend API:** `http://localhost/api/`

---

## 👤 User Management & Admin Access

### Authentication Flow
The application uses **Clerk** for secure user management. 
- **Auto-Sync**: When a user logs in via Clerk for the first time, a local profile is automatically created in the SQLite database to track their predictions and score.
- **Onboarding**: Users are prompted to choose a unique username upon their first visit to ensure a personalized experience on the leaderboard.

### Administrator Access
Admin privileges are granted via the `is_admin` flag in the local database.
- To promote a user to Admin, manually update the `is_admin` column to `1` for that user's record in the `users` table.
- Admins can access the dashboard (via the Gear Icon) to finalize scores and manage knockout stages.

---

## 📱 Features List

- **Real-time Match Filtering**: Traverse from Group A through Group L, or dive directly into Knockout brackets.
- **Dynamic Live Standings**: Instantly calculates Points, Goal Differences, and Matches Played per group as scores are finalized.
- **Secure Predictions**: Integrated Clerk authentication allowing users to submit exact-score predictions right up until the literal Match Kickoff time.
- **Points Architecture**:
  - `5 Points`: Exact scoreline guessed perfectly.
  - `3 Points`: Correct outcome + correct goal difference.
  - `1 Point`: Correct match outcome (Win/Draw/Loss).
