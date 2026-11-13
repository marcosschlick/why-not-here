# Why Not Here?

Contrastive explanations for autonomous path planning via Inverse Shortest Path (ISP) on 2D grids.

The system answers _"Why was the optimal path $p^*$ chosen instead of the user-expected alternative $p'$?"_ by formulating and solving an inverse optimization problem that identifies minimal cost adjustments and semantic explanations.

---

## Project Structure

- `src/`: Core scientific modules (A\*, procedural map generation, ISP formulation, reduction strategies, incremental solver).
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

In the simulation screen, the backend saves configurations in `configurations/`
and execution artifacts in `results/`, using automatic
`experiment-<H>x<W>-<YYYYMMDD-HHmmss>` names and numeric collision suffixes.
Each execution has its own `map/` and `results/` folders. Existing content is
never deleted or overwritten. Previewing a map or importing JSON writes no
artifacts; execution persists the displayed map in a fresh folder. Import JSON
using the browser file picker. Old configurations and API calls containing
removed name or destination options must be recreated in the current format.

Enable **Benchmark** to create ten configurations or executions per map:
monolithic and incremental, each with `NONE`, `PATH_ONLY`, `SPARSIFIED`, `BBOX`
and `FLOODFILL`. Each group shares the exact map, seed, endpoints and one reviewed
route. Each imported configuration is also expanded. Names identify solver and reduction,
results have separate directories, and removing a variant removes its group.
Benchmark is unavailable for questionnaire scenarios.

Use **Questionnaires** to create a draft and generate scenarios through the
existing simulation, route and results screens. Generate maps individually or
add or import configurations into a queue, then review routes and save scenarios.
Automatic batch map generation is available outside questionnaire scenarios.

Select three scenarios
for explanations and three different scenarios for prediction, then save the
protocol. The application generates all questions automatically. Preview either
group before activating the draft. The preview does not save answers. After
activation, open the **Local participant link** in the same installation to
test the real participant flow. The link uses the dashboard address and is not
for external access. No public participant URL is needed for local testing.

The fixed protocol collects a route choice, confidence (0 to 100), and a written
reason before each of three explanations. The control group receives the cost
justification; the experimental group receives the textual and visual contrastive
explanation. Eight adapted ESS items follow, then three new route predictions
without costs, explanations or correctness feedback.

Confirmed answers are saved at each step. Reloading the same participation in the
same browser tab resumes its server-controlled step; confirmed steps cannot be
revisited. Group assignment and A/B route order stay stable for that attempt.
After all steps, participants submit to mark the participation complete.

Generate individual keys in the questionnaire administration screen by entering
a quantity from 1 to 1,000. Copy unused keys and give one to each participant
along with the local participant link. The participant must enter a name, email
and key before the study begins. A key is consumed when participation starts,
and an email can be registered only once per questionnaire, ignoring case and
surrounding whitespace. Reloading the same tab resumes that participation;
closing the tab or clearing its session storage removes access to the attempt.
Answers remain stored in PostgreSQL, including unfinished participations.

The questionnaire schema requires an empty database. There is no migration or
compatibility with previous questionnaire schemas, and startup does not
erase or convert existing data. See [Questionnaire protocol](docs/questionnaire.md)
for the endpoints, instrument adaptation and timing definitions. Request schemas
are also available at `http://localhost:8000/docs`.

```bash
# Terminal 1: Local backend API (port 8000)
./venv/bin/python -B -m uvicorn web.api.app:app --host 127.0.0.1 --port 8000 --no-proxy-headers --reload

# Terminal 2: Local dashboard (port 5173)
cd web/frontend && npm run dev -- --host 127.0.0.1 --port 5173
```

For external participants, restart the dashboard with
`VITE_PUBLIC_BASE_URL=http://YOUR_LAN_IP:5174` in its environment and start the
separate participant services:

```bash
# Participant backend (port 8001, local proxy target only)
./venv/bin/python -B -m uvicorn web.api.public_app:app --host 127.0.0.1 --port 8001 --no-proxy-headers --reload

# Participant frontend (port 5174)
cd web/frontend && VITE_PUBLIC_ONLY=true VITE_BACKEND_URL=http://127.0.0.1:8001 VITE_PUBLIC_BASE_URL=http://YOUR_LAN_IP:5174 npm run dev -- --host 0.0.0.0 --port 5174
```

---

### 2. Docker Compose

Set `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in the shell or in an untracked
`.env` file in the project root. Optionally set `DB_PORT` to change the host
port published by PostgreSQL; it defaults to `5432`. The backend connects
to the database service on its internal port, independently of `DB_PORT`.
For external access, set `PUBLIC_PARTICIPANT_URL` to the URL participants can
reach, for example `http://YOUR_LAN_IP:5174`. The administration screen then
also displays a public participant link. Recreate the frontend services after
changing the URL. Local participation does not require this setting.

Run the entire stack (PostgreSQL + backend API + frontend) with:

```bash
docker compose up --build
```

- API: `http://localhost:8000`
- Dashboard: `http://localhost:5173`
- Participant frontend: `http://YOUR_LAN_IP:5174`

Only the participant frontend is published to the network. Its API proxy
connects to a separate service exposing only participation endpoints. Do not
expose the local dashboard, administrative API, or PostgreSQL through another
proxy. `POST /api/questionnaires/{id}/close` permanently closes an active
questionnaire: new submissions are rejected, and previously saved data remains
available for export. An identical retry of a completed submission is accepted.

The backend bind-mounts `./configurations` and `./results`, so default saved
configurations and results remain on the host after container recreation.
Relative paths resolve from the project root (`/app` inside the container).
Custom directories in Compose refer to the container filesystem; add a bind mount
when they must persist on the host. Local execution resolves relative paths from
the repository root, independently of the terminal's current directory.

PostgreSQL data is stored in the named `postgres_data` volume and persists
across container restarts and recreation. The PostgreSQL image applies the
database name and credentials only when initializing an empty volume; changing
those variables later does not update an existing database or user.
