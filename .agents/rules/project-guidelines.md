# Project Overview & Development Guidelines (TCC)

## 1. Project Overview

This repository contains the Bachelor's Thesis (TCC) research and implementation on **Trajectory Planning and Inverse Shortest Path (ISP)** on 2D grid maps with elevation and heterogeneous terrains.

- **Scientific Core (`src/`)**: Path planning algorithms (A\*, Dijkstra), MILP/CVXPY Inverse Shortest Path formulations (monolithic & cutting-plane incremental), and procedural terrain/elevation generation.
- **Web Platform (`web/`)**: Decoupled demonstration architecture consisting of a FastAPI backend service (`web/api/`) and a React frontend client (`web/frontend/`).

---

## 2. Design System & Palette

- Always strictly follow the official color tokens, contrast rules, and UI guidelines defined in `docs/palette.md`.

---

## 3. Interaction & Language Rules

- **Interaction Language**: Always converse, explain, and reply to user prompts in Brazilian Portuguese (`pt-BR`).
- **Code & System Language**: All code, identifiers, system logs, exception strings, API payloads, and terminal outputs must strictly be written in **English** (`en`).
- **Comments Allowed in Config Files Only**: Configuration files (`src/config/*.py`) are Python files where comments are permitted and recommended to document parameters and tune settings (in English).

---

## 4. Core Software Engineering Principles

- **KISS (Keep It Simple, Stupid)**: Always prefer the simplest and most direct solution. Avoid premature abstractions and over-engineering.
- **DRY (Don't Repeat Yourself)**: Do not duplicate business or mathematical logic, but do not introduce complex or unneeded abstractions.
- **SRP (Single Responsibility Principle)**: Every module, class, and function must have a single, clearly defined responsibility. Keep modules cohesive and decoupled under `src/` and `web/api/`.
- **Pattern Consistency**: Always match and preserve the existing project architecture, code styling, and conventions (Python 3.12+ with FastAPI, NumPy, CVXPY, HiGHS, and standard React frontend practices).
- **Absolute Readability**: Code must be clean, intuitive, and easy to explain verbally during academic presentations and project evaluations. Choose clarity over clever syntax shortcuts.

---

## 5. Strict Code Constraints & Guardrails

- **Zero Comments in Implementation Code**: NEVER write comments (`#`) or redundant docstrings (`"""` or `'''`) in source implementation code (`src/` and `web/api/`). The code must be completely self-documenting through its structure and expressive naming conventions (comments are strictly reserved for `src/config/*.py`).
- **No Test Files**: Do NOT generate automated test files (unit, integration, or e2e) unless explicitly and directly instructed by the user.
- **Strict Dependency Policy**: ALWAYS AVOID ADDING NEW DEPENDENCIES. Maximize the use of language standard libraries and already installed dependencies. Do not suggest or install new libraries/packages without direct permission.
- **Configuration Documentation Synchronization**: Whenever any change is made to files under `src/config/`, the documentation in `docs/config.md` must be immediately updated to reflect the new parameters and behaviors.

---

## 6. Execution & Environment Rules

- **Python Execution Without Bytecode Cache**: Always run Python commands with the `-B` flag to prevent generating `__pycache__` folders and `.pyc` files:
  ```bash
  python -B src/main.py
  ```
  (or using the virtual environment: `./venv/bin/python -B src/main.py`).
- **Web API Execution**:
  ```bash
  ./venv/bin/python -B -m uvicorn web.api.app:app --host 127.0.0.1 --port 8000 --reload
  ```

---

## 7. Project Architecture & Directory Layout

- `src/`: Core modular scientific and algorithmic source code.
  - `config/`: Modular configuration files (`config_grid.py`, `config_map.py`, `config_terrain.py`, `config_planning.py`, `config_isp.py`, `config_solver.py`, `config_incremental.py`, `config_reduction.py`, `config_storage.py`, `__init__.py`).
  - `grid/`: Grid data structures and topological representations (`grid.py`, `cell.py`).
  - `reduction/`: Graph reduction algorithms (`base.py`, `bbox.py`, `floodfill.py`, `sparsified.py`, `path_only.py`).
  - `incremental/`: Cutting-plane iterative ISP solver and closed-loop validation (`step_solver.py`, `closed_loop.py`, `validator.py`, `precheck.py`, `explanation.py`, `result.py`).
  - `map/`: Procedural terrain, elevation, and biome generation (`generator.py`, `noise.py`).
  - `planning/`: Path planning algorithms and heuristics (`astar.py`, `dijkstra.py`, `heuristics.py`, `planner.py`).
  - `isp/`: Inverse Shortest Path single-step formulation, MILP/CVXPY solvers, and semantic constraints (`solver.py`, `semantics.py`, `formulation.py`, `base.py`, `types.py`, `modifier.py`, `mccormick.py`).
  - `visual/`: Map plotting and tactical visualization (`plotter.py`, `layers.py`, `legend.py`, `style.py`).
  - `pipeline/`: Pipeline orchestration and benchmarks (`benchmark.py`, `generate_map.py`, `run_isp.py`, `utils.py`).
  - `main.py`: CLI entry point orchestrating execution pipelines.
- `web/`: Decoupled web demonstration and interface layer.
  - `api/`: Modular FastAPI backend service exposing endpoints for simulation control (`app.py`, `routes.py`, `schemas.py`, `config_manager.py`, `runner.py`, `artifacts.py`, `__init__.py`).
  - `frontend/`: React frontend client application.
- `docs/`: System documentation, configuration reference (`config.md`), and design palette (`palette.md`).
