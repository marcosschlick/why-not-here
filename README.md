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
export ADMIN_EXPORT_KEY=your_export_key
```

`DB_HOST` and `DB_PORT` default to `127.0.0.1` and `5432` when omitted. The
database and user must already exist. The API creates its tables on startup
and does not start if database initialization fails.

Questionnaire draft and question endpoints, including their request formats,
are available in the API documentation at `http://localhost:8000/docs`.
Questions of type `route_choice` or `route_drawing` require a `scenario_id`
belonging to the same questionnaire. Route choice uses the scenario's optimal
and alternative paths; route drawing uses its map and endpoints.
Create draft scenarios using the simulation configuration, route and results screens.
The results screen saves successful calculations through
`POST /api/questionnaires/{id}/scenarios`; scenario list and detail endpoints
return the saved map, routes and results.
Use **Questionnaires** in the application navigation to administer drafts and
preview their saved questions and scenarios for either group without saving answers. The scenario view shows the requested and effective seeds. The API saves question ordering via
`PUT /api/questionnaires/{id}/questions/order`, with a `question_ids` array
containing every question in the desired order.
Activate a draft in the administration screen to lock it and obtain a
participant link. Participants answer all questions without an account and
submit their responses together; refreshing before submission resets the form.
The API exposes `POST /api/questionnaires/{id}/activate`,
`GET /api/participate/{token}`, and `POST /api/participate/{token}/submit`.
The participant GET requires the `submission_key` UUID query parameter. It
determines a stable randomized route order for each question and attempt. New
route-choice answers store their displayed order in `answers.route_order`;
older answers have a null order and used optimal followed by alternative.
Before revealing a scenario justification, the participant must confirm every
route-choice question linked to that scenario using
`POST /api/participate/{token}/questions/{question_id}/confirm` with
`submission_key` and the selected `choice` (0 or 1). The confirmation and route
order persist across reloads; changing a confirmed choice returns a conflict.
The final submission must contain the confirmed choice. Repeating a completed
submission with different answers returns a conflict.

Each new participation is assigned to either the control group (cost baseline)
or experimental group (contrastive explanation). The assignment remains stable
for the same attempt and is saved on submission. Older participations have no
group. Each scenario referenced by a question must contain both justifications.

Set `ADMIN_EXPORT_KEY` to enable results export, and enter the same key in the
administration screen to download the questionnaire results as JSON. The API
also supports `GET /api/questionnaires/{id}/export` with the `X-Export-Key`
header. Exports include completed participations, questions, scenarios, answers,
groups, and route ordering; they exclude access tokens and submission keys.
The export key does not protect other administrative routes.

```bash
# Terminal 1: Local backend API (port 8000)
./venv/bin/python -B -m uvicorn web.api.app:app --host 127.0.0.1 --port 8000 --no-proxy-headers --reload

# Terminal 2: Participant backend (port 8001, local proxy target only)
./venv/bin/python -B -m uvicorn web.api.public_app:app --host 127.0.0.1 --port 8001 --no-proxy-headers --reload

# Terminal 3: Local dashboard (port 5173)
cd web/frontend && VITE_PUBLIC_BASE_URL=http://YOUR_LAN_IP:5174 npm run dev -- --host 127.0.0.1 --port 5173

# Terminal 4: Participant frontend (port 5174)
cd web/frontend && VITE_PUBLIC_ONLY=true VITE_BACKEND_URL=http://127.0.0.1:8001 VITE_PUBLIC_BASE_URL=http://YOUR_LAN_IP:5174 npm run dev -- --host 0.0.0.0 --port 5174
```

---

### 2. Docker Compose

Set `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in the shell or in an untracked
`.env` file in the project root. Optionally set `DB_PORT` to change the host
port published by PostgreSQL; it defaults to `5432`. The backend connects
to the database service on its internal port, independently of `DB_PORT`.
Set `ADMIN_EXPORT_KEY` in the shell or `.env` to enable protected JSON export.
Set `PUBLIC_PARTICIPANT_URL` to the URL participants can reach, for example
`http://YOUR_LAN_IP:5174`. The local administration screen uses this URL to
build participant links; without it the link is unavailable. Recreate the
frontend services after changing the URL.

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

PostgreSQL data is stored in the named `postgres_data` volume and persists
across container restarts and recreation. The PostgreSQL image applies the
database name and credentials only when initializing an empty volume; changing
those variables later does not update an existing database or user.
