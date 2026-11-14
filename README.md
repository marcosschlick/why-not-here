# Why Not Here?

Contrastive explanations for autonomous path planning via Inverse Shortest Path (ISP) on 2D grids.

The system answers _"Why was the optimal path $p^*$ chosen instead of the user-expected alternative $p'$?"_ by formulating and solving an inverse optimization problem that identifies minimal cost adjustments and semantic explanations.

The normal model uses four Eder-inspired interventions: one cell opening for all
blocking causes, directed slope correction to ±20°, environmental speed removal
at 1 m/s, and hypothetical robot capability at 5 m/s. Every action costs one.
Speed eligibility is frozen at the original 75% threshold; speed activations use
effective edge speed without an extra slope penalty. The finite reference for
blocked edges is a documented grid adaptation. Brandao retains its separate
terrain-assignment model. See [model details](docs/benchmark.md).
Saved normal configurations require `NORMAL_MODEL_VERSION=normal-eder-grid-v1`;
incompatible old configurations, maps and intervention records must be regenerated.
No migration or compatibility conversion is provided.

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

Enable **Benchmark** to run twelve scenarios per map: ten normal
combinations (monolithic/incremental × `NONE`, `PATH_ONLY`, `SPARSIFIED`, `BBOX`,
`FLOODFILL`) followed by Brandao monolithic and incremental, both without
reduction. Outside the full benchmark, configuring normal incremental with
`NONE` automatically runs the normal scenario plus both Brandao strategies on
the same source map, endpoints and alternative route. Other individual settings
run only their normal scenario. There is no manual traversal-model selector.

Configuration files contain only normal scenarios. An individual configuration
saves one file; a full benchmark saves ten normal files per map. Importing
or executing a normal incremental/`NONE` file generates the trio automatically,
including `python -B src/main.py run configuration.json`. Brandao remains an
internal, separately recorded model with fast/slow 1:8 costs and no slope effects.
Its time differences from normal scenarios cannot be attributed solely to solver
strategy. No legacy conversion or deduplication is applied.

Both strategies use one cooperative preparation-through-validation budget.
Queue `Completed` means all scenarios were processed without execution errors;
it does not mean that all routes were validated. Individual outcomes distinguish
validation, infeasibility, inconclusive results and limits. Results use the existing
metric cards; detailed diagnostics remain in **Export Scenarios (CSV)** and
**Export Iterations (CSV)**, including unsuccessful attempts and execution order.
Benchmark remains unavailable for questionnaire scenarios.
See [Computational ISP benchmark](docs/benchmark.md) for formulas, metric units,
reproduction and measurement limitations.

Use **Questionnaires** to create a draft and select **Prepare six scenarios**.
Choose only the grid size; the existing generator and size profiles are preserved.
Generate six maps with randomly selected multiples of 42 from 42 to 4200, unique within each questionnaire.
Draw all six alternative routes manually, then run monolithic ISP without reduction.
Successes are saved immediately; failures are replaced with new seeds and
require new manual routes. After six consecutive generation failures, continue
explicitly or leave. Unresolved drawings are temporary and leaving warns before
discarding them. Successful scenarios, configuration and the seed cursor persist.
The normal simulation retains individual creation, configuration imports and queues.

Six successful scenarios automatically save the protocol. Each participation
receives a stored random order: three scenarios with explanations followed by
three unseen predictions, with fourteen adapted rating items between phases.
Preview all three conditions before activating the draft. Preview does not save
answers. After
activation, use **Open questionnaire** under **Local participation** to open
`/questionnaire` in a new tab, or **Copy link** to share its local address.
The address has no token; each participant's individual key identifies the study.
The local link uses the dashboard origin and is not for external access.
No public participant URL is needed for local testing.

Active and closed questionnaires show a read-only overview instead of disabled
editing forms. Use **View scenarios** to inspect saved maps or open the existing
participant preview. The participation panel shows completed, in-progress and
total started participations and completed counts by group; use **Refresh results**
to update them. **View results** expands descriptive item distributions, prediction
matches, mean confidence and median decision time for completed participations.
Only final submissions count as completed. Predictive accuracy / alignment with
the system’s choice is one measure: the proportion of valid predictions matching
the optimal route. **Export completed responses (CSV)** exports completed answers
with a stable random three-digit code (`000`–`999`) unique per questionnaire,
without name, email or credentials. Import the code column as text to preserve
leading zeros. Free-text answers can contain participant-entered information.
The 1,000-code capacity also limits issued individual keys. Draft editing remains
unchanged.

The fixed protocol allows route changes until **Confirm route**, then collects
confidence (0 to 100) and a written reason before each of three explanations.
A separate required open response after each explanation asks which
characteristics explain the system’s choice. The three conditions receive a cost
justification, contrastive text, or the same contrastive text with intervention
visualization. Starts use randomized blocks of three, one assignment per condition.
Resuming preserves the original assignment. Fourteen adapted items selected from ESS, SCS and xHIS follow, all using a
five-point agreement scale, then three new route predictions
with confidence (0 to 100), without costs, explanations or correctness feedback.

Confirmed answers and partial fields/timings are saved in PostgreSQL. Reloading
the same tab resumes automatically; reopening `/questionnaire` and entering the
original name, email and key also recovers the attempt in another tab or browser.
Confirmed steps cannot be revisited. Group, scenario order and A/B route order
remain stable. Selection times exclude confidence, justification, hidden-tab
intervals and time away between visits.
After all steps, participants submit to mark the participation complete.

In **Participation keys**, use **Generate keys** to open the quantity form
(default 10, range 1 to 1,000). Use **Copy** on an available key to give it to one
participant along with the local participant link. **Available** and **Used**
share one list; **Refresh** reloads usage and **Copy available keys** offers
secondary batch copying. Closed questionnaires hide this section. The participant
must enter a name, email and key before the study begins. A key is reserved when
participation starts,
and an email can be registered only once per questionnaire, ignoring case and
surrounding whitespace. The same key, name and email can resume that
participation after closing the tab or clearing session storage.
Answers remain stored in PostgreSQL, including unfinished participations.

The custom instrument is not a full or validated administration of the source
scales. See [the selected items and original sources](docs/questionarios-avaliacao.md).

The `route-study-v4` questionnaire schema requires a fresh set of questionnaire
tables. There is no migration or
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
also displays controls to open or copy the public `/questionnaire` link.
Recreate the frontend services after changing the URL. Local participation does not require this setting.

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
