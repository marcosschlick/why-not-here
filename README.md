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

The API requires a running PostgreSQL database. Set the database connection
variables in the backend terminal before starting it:

```bash
export DB_HOST=127.0.0.1
export DB_PORT=5432
export DB_USER=your_database_user
export DB_PASSWORD=your_database_password
export DB_NAME=your_database_name
```

`DB_HOST` and `DB_PORT` default to `127.0.0.1` and `5432` when omitted. The
database and user must already exist. The API creates its tables on startup
and does not start if database initialization fails.

Questionnaire draft and question endpoints, including their request formats,
are available in the API documentation at `http://localhost:8000/docs`.
Questions of type `route_choice` or `route_drawing` require a `scenario_id`
belonging to the same questionnaire. Route choice uses the scenario's optimal
and alternative paths; route drawing uses its map and endpoints.
Draft scenarios can be generated synchronously with
`POST /api/questionnaires/{id}/scenarios` and retrieved through the scenario
list and detail endpoints. Generation can take as long as the configured solver
limits; only successful results are saved.
Use **Questionnaires** in the application navigation to administer drafts and
preview their saved questions and scenarios. The API saves question ordering via
`PUT /api/questionnaires/{id}/questions/order`, with a `question_ids` array
containing every question in the desired order.

```bash
# Terminal 1: Backend API (port 8000)
./venv/bin/python -B -m uvicorn web.api.app:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Frontend Dashboard (port 5173)
cd web/frontend && npm run dev
```

---

### 2. Docker Compose

Set `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in the shell or in an untracked
`.env` file in the project root. Optionally set `DB_PORT` to change the host
port published by PostgreSQL; it defaults to `5432`. The backend connects
to the database service on its internal port, independently of `DB_PORT`.

Run the entire stack (PostgreSQL + backend API + frontend) with:

```bash
docker compose up --build
```

- API: `http://localhost:8000`
- Dashboard: `http://localhost:5173`

PostgreSQL data is stored in the named `postgres_data` volume and persists
across container restarts and recreation. The PostgreSQL image applies the
database name and credentials only when initializing an empty volume; changing
those variables later does not update an existing database or user.
