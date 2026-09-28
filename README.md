# Why Not Here?

Contrastive explanations for autonomous path planning via Inverse Shortest Path (ISP) on 2D grids.

The system answers _"Why was the optimal path $p^_$ chosen instead of the user-expected alternative $p'$?"\* by formulating and solving an inverse optimization problem that identifies minimal cost adjustments and semantic explanations.

---

## Project Structure

- `src/`: Core scientific modules (A\*, Dijkstra, procedural map generation, ISP formulation, reduction strategies, incremental solver).
- `web/api/`: FastAPI backend service exposing endpoints for simulations and benchmarks.
- `web/frontend/`: React + TypeScript interactive dashboard for map exploration and path comparison.
- `docs/`: Parameter configuration reference (`config.md`) and design palette tokens (`palette.md`).

---

## How to Run

### 1. Local Setup

#### Prerequisites

- Python 3.12+
- Node.js 18+ (for frontend)

#### Install Dependencies

```bash
# Python dependencies
pip install -r requirements.txt

# Frontend dependencies
cd web/frontend && npm install && cd ../..
```

#### Running CLI Pipeline

```bash
python -B src/main.py
```

#### Running Web Platform

```bash
# Terminal 1: Backend API (port 8000)
uvicorn web.api.app:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Frontend Dashboard (port 5173)
cd web/frontend && npm run dev
```

---

### 2. Docker Compose

Run the entire stack (backend API + frontend) with a single command:

```bash
docker compose up --build
```

- API: `http://localhost:8000`
- Dashboard: `http://localhost:5173`
