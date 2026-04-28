# 🏆 World Cup 2026 Predictions Dashboard

A high-performance, full-stack web application built to predict, track, and manage matches for the FIFA World Cup 2026. Designed with a premium glassmorphic UI, dynamic knockout bracket generation, and a fully decoupled backend architecture.

## ⚡ Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.13)
- **Database**: SQLite (`worldcup.db`) using SQLAlchemy ORM
- **Authentication**: Stateless JWT Passwords
- **Package Manager**: `uv` (Fast Python package installer and resolver)

### Frontend
- **Framework**: Vanilla JS + Vite
- **Styling**: Pure CSS (Modern Glassmorphism, CSS Variables, Flexbox/Grid)
- **Icons/Visuals**: SVGs hosted via CDN (FlagCDN)

---

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Python 3.13+**
- **Node.js 18+**
- **[uv](https://github.com/astral-sh/uv)** (Python package manager)

---

## 🚀 How to Run the Project locally

The application uses an isolated backend server that runs concurrently with a Vite frontend dev server. You will need to open **two** terminal windows.

### 1. Start the Backend (API Server)

Open your first terminal and navigate to the project root:

```bash
cd backend

# Create and sync the virtual environment using uv
uv venv
uv pip install -r requirements.txt

# Activate the virtual environment
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Start the FastAPI server (runs on http://localhost:8000)
python run.py
```
*Note: The first time the backend boots, it will automatically execute `seed.py` and populate the SQLite database with all 48 World Cup teams and the 72 group-stage fixtures.*

### 2. Start the Frontend (Vite Server)

Open your second terminal and navigate to the frontend directory:

```bash
cd frontend

# Install Node modules
npm install

# Start the Vite development server (usually runs on http://localhost:5173)
npm run dev
```

---

## 🔐 Administrator Access

The system comes pre-seeded with a master Admin account. The admin has the power to finalize match scores, allocate prediction points globally, and manually schedule the Knockout brackets (Round of 32, 16, Quarter-finals, etc.).

- **Username**: `admin`
- **Password**: `admin123`

To access the admin panel, log in using the credentials above and click the **Gear Icon** in the top navigation bar, or navigate directly to `#/admin`.

---

## 📱 Features List

- **Real-time Match Filtering**: Traverse from Group A through Group L, or dive directly into Knockout brackets.
- **Dynamic Live Standings**: Instantly calculates Points, Goal Differences, and Matches Played per group as scores are finalized.
- **Stateless Predictions**: Fully integrated JWT authentication allowing users to submit exact-score predictions right up until the literal Match Kickoff time.
- **Points Architecture**:
  - `5 Points`: Exact scoreline guessed perfectly.
  - `3 Points`: Correct outcome + correct goal difference.
  - `1 Point`: Correct match outcome (Win/Draw/Loss).
