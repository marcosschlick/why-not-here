# Why Not Here?

Contrastive explanations for autonomous path planning via Inverse Shortest Path (ISP) on 2D grids.

The system answers _"Why was the optimal path $p^*$ chosen instead of the user-expected alternative $p'$?"_ by formulating and solving an inverse optimization problem that identifies minimal cost adjustments and semantic explanations.

---

## Project Structure

- `src/`: Core scientific modules (A\*, Dijkstra, procedural map generation, ISP formulation, reduction strategies, incremental solver).
- `web/api/`: FastAPI backend service exposing endpoints for simulations and experiments.
- `web/frontend/`: React + TypeScript interactive dashboard for map exploration and path comparison.
- `docs/`: Parameter configuration reference (`config.md`) and design palette tokens (`palette.md`).

---

## How to Run

### 1. Local Setup

#### Prerequisites

- Python 3.12+
- Node.js 20.19+ or 22.12+ (for the frontend; required by the Vite version in the lockfile)

#### Install Dependencies

```bash
# Create and prepare the Python virtual environment
python -B -m venv venv
./venv/bin/python -B -m pip install -r requirements.txt

# Frontend dependencies
cd web/frontend && npm install && cd ../..
```

#### Running CLI Pipeline

```bash
# Interactive menu
./venv/bin/python -B src/main.py

# Run experiment directly from configuration file
./venv/bin/python -B src/main.py run path/to/experiment.json
```

#### Running Web Platform

```bash
# Terminal 1: Backend API (port 8000)
./venv/bin/python -B -m uvicorn web.api.app:app --host 127.0.0.1 --port 8000 --reload

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
