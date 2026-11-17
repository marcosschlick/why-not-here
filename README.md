# Why Not Here?

Contrastive explanations for autonomous path planning via Inverse Shortest Path (ISP) on 2D grids.

The system answers _"Why was the optimal path $p^*$ chosen instead of the user-expected alternative $p'$?"_ by formulating and solving an inverse optimization problem that identifies minimal cost adjustments and semantic explanations.

The normal model uses four Eder-inspired interventions: one cell opening for all
blocking causes, directed slope correction to ±20°, environmental speed removal
at 1 m/s, and hypothetical robot capability at 5 m/s. Every action costs one.
Speed eligibility is frozen at the original 75% threshold; speed activations use
effective edge speed without an extra slope penalty. The finite reference for
blocked edges is a documented grid adaptation. Brandao retains its separate
terrain-assignment model.
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

- Python 3.12 (the project uses 3.12.15 locally and Python 3.12 in containers)
- Node.js 20.19+ or 22.12+ (the frontend container uses Node.js 24)
- PostgreSQL 18 for the containerized database
- Python package versions are pinned in `requirements.txt`; frontend versions are locked in `web/frontend/package-lock.json`.

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

The API requires a running PostgreSQL database. Start only the Compose database
with `docker compose up -d db` (or `podman compose up -d db`), then set the
matching connection variables in the backend terminal:

```bash
export DB_HOST=127.0.0.1
export DB_PORT=5432
export DB_USER=why_not_here
export DB_PASSWORD=why_not_here_local_password
export DB_NAME=why_not_here
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

Enable **Benchmark** to run seventeen scenarios per map: five normal
monolithic combinations and ten incremental combinations (with `SUBGRAPH` and
`GLOBAL` scopes) across `NONE`, `PATH_ONLY`, `SPARSIFIED`, `BBOX`,
and `FLOODFILL`, followed by Brandao monolithic and incremental, both without
reduction. Outside the full benchmark, configuring normal incremental with
`NONE` automatically runs the normal scenario plus both Brandao strategies on
the same source map, endpoints and alternative route. Other individual settings
run only their normal scenario. There is no manual traversal-model selector.

Configuration files contain only normal scenarios. An individual configuration
saves one file; a full benchmark saves fifteen normal files per map. Importing
or executing a normal incremental/`NONE` file generates the trio automatically,
including `python -B src/main.py run configuration.json`. Brandao remains an
internal, separately recorded model with fast/slow 1:8 costs and no slope effects.
Its time differences from normal scenarios cannot be attributed solely to solver
strategy. No legacy conversion or deduplication is applied.

Run configurations saved in the simulation screen from the project root:

```bash
python -B src/main.py run configurations/experiment-example.json
python -B src/main.py run configurations/batch-example
python -B src/main.py run configurations/batch-benchmark-example
```

The first command runs one configuration. The second runs every JSON directly
inside a saved batch directory. The third runs a batch saved with Benchmark
enabled: its fifteen normal configurations per map expand to seventeen
executions. Choose Benchmark before saving in the web interface; the CLI does
not add it to ordinary configurations. Batch results are grouped under a new
`results/batch-*` directory, and `batch.json` identifies each source file,
scenario, output directory and execution error. Processing continues after
individual failures, and the CLI returns a nonzero status if any execution fails.

Both strategies use one cooperative preparation-through-validation budget.
Queue `Completed` means all scenarios were processed without execution errors;
it does not mean that all routes were validated. Individual outcomes distinguish
validation, infeasibility, inconclusive results and limits. Results use the existing
metric cards; detailed diagnostics remain in **Export Scenarios (CSV)** and
**Export Iterations (CSV)**, including unsuccessful attempts and execution order.
Benchmark remains unavailable for questionnaire scenarios.

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
scales.

The `route-study-v4` questionnaire schema requires a fresh set of questionnaire
tables. There is no migration or
compatibility with previous questionnaire schemas, and startup does not
erase or convert existing data. Request schemas
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

### 2. Complete application with Compose

Clone the repository and run:

```bash
docker compose up -d
```

Replace `docker` with `podman` when using Podman. Compose downloads the public
backend, frontend, and PostgreSQL images as needed. Open `http://localhost:5173`.
The API is available at `http://localhost:8000` and the participant interface at
`http://localhost:5174`. To update published images, run `docker compose pull`
followed by `docker compose up -d`.

To run only the database and start the API and frontend locally, use
`docker compose up -d db` and follow the local setup above. This command does not
stop other services that are already running. The database, results and saved
configurations use persistent named volumes. PostgreSQL creates its credentials
only when its volume is empty; an existing volume requires its original credentials.

For participants on another device, set `PUBLIC_PARTICIPANT_URL` to the URL they
can reach before starting Compose. Only the participant frontend is exposed to
the network; do not expose the dashboard, administrative API or database.

### 3. Standalone image

After the standalone image has been published to Docker Hub, run the entire
application without cloning the repository or installing Compose:

```bash
docker run -d --name why-not-here -p 127.0.0.1:5173:5173 \
  -v why-not-here-db:/var/lib/why-not-here \
  -v why-not-here-results:/app/results \
  -v why-not-here-configurations:/app/configurations \
  marcosschlick/why-not-here:latest
```

Open `http://localhost:5173`. Replace `docker` with `podman` if needed. The image
contains its own PostgreSQL, API, and frontend; the named volumes retain data
across container recreation. To enable the participant interface on another
device, also publish port 5174 and set `PUBLIC_PARTICIPANT_URL` to its reachable
URL. The standalone and Compose database volumes are independent.

The GitHub Actions workflow publishes the two Compose images and the standalone
image after changes are pushed to `main`. Configure the `DOCKERHUB_USERNAME` and
`DOCKERHUB_TOKEN` repository secrets before running it.
