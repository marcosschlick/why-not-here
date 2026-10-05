import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, HTTPException

from src import config
from src.grid import Grid
from src.incremental import ISPValidator
from src.isp.precheck import validate_alternative_path
from src.pipeline.artifact_names import (
    MAP_DIRECTORY_NAME,
    MAP_IMAGE_FILENAME,
    OUTPUT_ARTIFACT_FILENAMES,
)
from src.pipeline.experiment_config import (
    apply_experiment_config,
    build_experiment_config,
    save_experiment_configurations,
    validate_experiment_config,
)
from src.pipeline.generate_map import generate_map
from src.pipeline.run_isp import run_isp
from src.pipeline.utils import (
    create_alternative_path,
    get_project_path,
    prepare_endpoints,
)
from src.planning import plan_path
from src.visual.layers import find_steep_cells

from .artifacts import collect_artifacts
from .config_manager import get_all_configurations, update_configurations
from .runner import runner
from .schemas import (
    BrowseRequest,
    ExportConfigRequest,
    GenerateMapRequest,
    ImportConfigRequest,
    RunRequest,
    SaveConfigurationsRequest,
    SemanticModificationsData,
    SolveISPRequest,
)

router = APIRouter(prefix="/api")


def _generation_metadata(grid: Grid) -> dict[str, int | None]:
    return {
        "base_seed": grid.base_seed,
        "effective_seed": grid.effective_seed,
        "generation_attempt": grid.generation_attempt,
    }


def _map_image_url(persist_artifacts: bool) -> str:
    if not persist_artifacts:
        return ""
    return (
        f"/output/{MAP_DIRECTORY_NAME}/{MAP_IMAGE_FILENAME}"
        f"?dir={quote(config.OUTPUT_DIR, safe='')}"
    )


def _grid_layers(grid: Grid) -> dict[str, Any]:
    return {
        "cell_size": grid.cell_size,
        "max_slope_deg": grid.max_slope_deg,
        "steep_cells": sorted(find_steep_cells(grid)),
        "elevation_shade_min": config.MAP_ELEVATION_SHADE_MIN,
        "elevation_shade_max": config.MAP_ELEVATION_SHADE_MAX,
    }


def sanitize_floats(obj: Any) -> Any:
    if isinstance(obj, float):
        if math.isinf(obj) or math.isnan(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_floats(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_floats(item) for item in obj]
    return obj


@router.get("/config")
def read_config() -> dict[str, Any]:
    return get_all_configurations()


@router.post("/config")
def modify_config(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        updated_items = update_configurations(payload)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "success", "updated": updated_items}


@router.post("/config/export")
def export_configuration_endpoint(payload: ExportConfigRequest) -> dict[str, Any]:
    config_dict = payload.config or {}
    start = (int(payload.start[0]), int(payload.start[1]))
    goal = (int(payload.goal[0]), int(payload.goal[1]))
    user_path = [(int(pt[0]), int(pt[1])) for pt in payload.user_path]
    try:
        return build_experiment_config(
            config_dict=config_dict,
            start=start,
            goal=goal,
            user_path=user_path,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/config/save")
def save_configurations_endpoint(
    payload: SaveConfigurationsRequest,
) -> dict[str, Any]:
    configurations = [item.model_dump() for item in payload.configurations]
    try:
        saved_files = save_experiment_configurations(
            destination_dir=payload.destination_dir,
            configurations=configurations,
        )
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save configuration files: {exc!s}",
        ) from exc
    return {"status": "success", "saved_files": saved_files}


@router.post("/config/import")
def import_configuration_endpoint(payload: ImportConfigRequest) -> dict[str, Any]:
    raw_data = payload.model_dump(exclude_unset=True)
    try:
        params, start, goal, p_user = validate_experiment_config(raw_data)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.persist_artifacts and not str(params.get("OUTPUT_DIR", "")).strip():
        raise HTTPException(
            status_code=400,
            detail="Output directory is required when importing a configuration for a run.",
        )

    try:
        apply_experiment_config(params, start=start, goal=goal)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        grid = generate_map(
            verbose=False,
            persist_artifacts=payload.persist_artifacts,
        )
        prepare_endpoints(grid)
        is_valid, _, invalid_message = validate_alternative_path(
            grid, start, goal, p_user
        )
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail=invalid_message
                or "Alternative route is invalid for the imported map.",
            )

        optimal_path, optimal_cost, _ = plan_path(
            grid, start, goal, algorithm=config.DEFAULT_PLANNER
        )

        safe_optimal_cost = (
            round(optimal_cost, 4)
            if optimal_cost is not None
            and not math.isinf(optimal_cost)
            and not math.isnan(optimal_cost)
            else None
        )

        auto_path = create_alternative_path(grid, start, goal)

        response_data = {
            "status": "success",
            "h": grid.h,
            "w": grid.w,
            "connectivity": grid.connectivity,
            "start": list(start),
            "goal": list(goal),
            "elevation": grid.elevation,
            "terrain": grid.terrain,
            "obstacle": grid.obstacle,
            "auto_path": auto_path,
            "optimal_path": optimal_path if optimal_path else [],
            "optimal_cost": safe_optimal_cost,
            "map_image_url": _map_image_url(payload.persist_artifacts),
            **_grid_layers(grid),
            "config": get_all_configurations(),
            "generation": _generation_metadata(grid),
            "user_path": [list(pt) for pt in p_user],
        }
        return sanitize_floats(response_data)
    except HTTPException:
        raise
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to import configuration: {exc!s}"
        ) from exc


@router.post("/map/generate")
def generate_map_endpoint(payload: GenerateMapRequest) -> dict[str, Any]:
    persist_artifacts = payload.persist_artifacts
    updates: dict[str, Any] = payload.model_dump(exclude_unset=True, exclude_none=True)
    updates.pop("persist_artifacts", None)
    if "extra_config" in updates:
        extra = updates.pop("extra_config")
        if isinstance(extra, dict):
            updates.update(extra)

    effective_output_dir = updates.get("OUTPUT_DIR", config.OUTPUT_DIR)
    if persist_artifacts and not str(effective_output_dir or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Output directory is required. Select a directory before generating map artifacts.",
        )

    try:
        apply_experiment_config(updates, start=None, goal=None)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        grid = generate_map(
            verbose=False,
            persist_artifacts=persist_artifacts,
        )
        start, goal = prepare_endpoints(grid)
        auto_path = create_alternative_path(grid, start, goal)
        optimal_path, optimal_cost, _ = plan_path(
            grid, start, goal, algorithm=config.DEFAULT_PLANNER
        )

        safe_optimal_cost = (
            round(optimal_cost, 4)
            if optimal_cost is not None
            and not math.isinf(optimal_cost)
            and not math.isnan(optimal_cost)
            else None
        )

        response_data = {
            "status": "success",
            "h": grid.h,
            "w": grid.w,
            "connectivity": grid.connectivity,
            "start": list(start),
            "goal": list(goal),
            "elevation": grid.elevation,
            "terrain": grid.terrain,
            "obstacle": grid.obstacle,
            "auto_path": auto_path,
            "optimal_path": optimal_path if optimal_path else [],
            "optimal_cost": safe_optimal_cost,
            "map_image_url": _map_image_url(persist_artifacts),
            **_grid_layers(grid),
            "config": get_all_configurations(),
            "generation": _generation_metadata(grid),
        }
        return sanitize_floats(response_data)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate map: {exc!s}"
        ) from exc


@router.post("/isp/solve")
def solve_isp_endpoint(payload: SolveISPRequest) -> dict[str, Any]:
    if runner.is_running():
        raise HTTPException(
            status_code=409, detail="Pipeline execution already in progress"
        )

    start = payload.start
    goal = payload.goal
    if payload.user_path:
        if start is None:
            start = payload.user_path[0]
        if goal is None:
            goal = payload.user_path[-1]
    try:
        apply_experiment_config(payload.config or {}, start=start, goal=goal)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not str(config.OUTPUT_DIR or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Output directory is required before executing the ISP solver.",
        )

    p_user = None
    if payload.user_path is not None:
        p_user = [tuple(p) for p in payload.user_path]

    with runner.lock:
        runner.state["last_result"] = None
        runner.state["artifacts"] = []
        runner.state["error"] = None
        runner.state["status"] = "solving"

    try:
        result = run_isp(verbose=False, user_path=p_user, start=start, goal=goal)
        if not result:
            raise HTTPException(
                status_code=500,
                detail="ISP solver failed to produce a valid path or solution.",
            )

        modifications = None
        if result.modifications is not None:
            modifications = SemanticModificationsData(
                terrain=len(result.modifications.terrain_nodes),
                obstacle=len(result.modifications.obstacle_nodes),
                slope=len(result.modifications.slope_edges),
                water=len(result.modifications.water_nodes),
                terrain_nodes=result.modifications.terrain_nodes,
                obstacle_nodes=result.modifications.obstacle_nodes,
                slope_edges=result.modifications.slope_edges,
                water_nodes=result.modifications.water_nodes,
            ).model_dump(mode="json")

        orig_cost = (
            round(result.original_optimal_cost, 4)
            if result.original_optimal_cost is not None
            and not math.isinf(result.original_optimal_cost)
            and not math.isnan(result.original_optimal_cost)
            else None
        )
        final_cost = (
            round(result.final_alternative_cost, 4)
            if result.final_alternative_cost is not None
            and not math.isinf(result.final_alternative_cost)
            and not math.isnan(result.final_alternative_cost)
            else None
        )
        runtime = (
            round(result.runtime_sec, 3)
            if result.runtime_sec is not None
            and not math.isinf(result.runtime_sec)
            and not math.isnan(result.runtime_sec)
            else 0.0
        )

        last_result = {
            "success": result.success,
            "solver_status": result.solver_status,
            "runtime_sec": runtime,
            "iterations": result.iterations,
            "original_optimal_cost": orig_cost,
            "final_alternative_cost": final_cost,
            "explanation_text": result.explanation_text,
            "cost_baseline_text": result.cost_baseline_text,
            "modifications": modifications,
        }

        if result.modifications is not None:
            map_json_path = get_project_path(config.OUTPUT_DIR) / "map" / "map.json"
            original_grid = Grid.load(map_json_path)
            prepare_endpoints(original_grid, start=start, goal=goal)
            modified_grid = ISPValidator.apply_modifications(
                original_grid, result.modifications
            )
            last_result["modified_grid"] = {
                **modified_grid.to_dict(),
                **_grid_layers(modified_grid),
            }

        artifacts = collect_artifacts(config.OUTPUT_DIR)

        sanitized_result = sanitize_floats(last_result)

        with runner.lock:
            runner.state["last_result"] = sanitized_result
            runner.state["artifacts"] = artifacts
            runner.state["status"] = "completed"

        return {
            "status": "success",
            "result": sanitized_result,
            "artifacts": artifacts,
        }
    except Exception as exc:
        with runner.lock:
            runner.state["error"] = str(exc)
            runner.state["status"] = "failed"
        if isinstance(exc, HTTPException):
            raise
        if isinstance(exc, FileNotFoundError):
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        raise HTTPException(
            status_code=500, detail=f"Error executing ISP solver: {exc!s}"
        ) from exc


@router.post("/run")
def execute_pipeline(payload: RunRequest) -> dict[str, Any]:
    if not str(config.OUTPUT_DIR or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Output directory is required before starting the pipeline.",
        )
    if runner.is_running():
        raise HTTPException(
            status_code=409, detail="Pipeline execution already in progress"
        )
    runner.start(payload.runs)
    return {"status": "started", "runs": payload.runs}


@router.get("/status")
def fetch_status() -> dict[str, Any]:
    return runner.get_status()


@router.get("/fs/directories")
def list_directories(path: str = "") -> dict[str, Any]:
    project_root = Path(__file__).resolve().parents[2]
    if path and path.strip():
        target_path = Path(path).resolve()
    else:
        target_path = project_root

    if not target_path.exists() or not target_path.is_dir():
        target_path = project_root

    subdirs = []
    try:
        for entry in sorted(target_path.iterdir(), key=lambda p: p.name.lower()):
            if entry.is_dir() and not entry.name.startswith("."):
                subdirs.append(entry.name)
    except PermissionError:
        subdirs = []

    try:
        relative_to_root = str(target_path.relative_to(project_root))
    except ValueError:
        relative_to_root = str(target_path)

    parent_path = (
        str(target_path.parent)
        if target_path != target_path.parent
        else str(target_path)
    )

    return {
        "current": str(target_path),
        "parent": parent_path,
        "directories": subdirs,
        "relative_to_root": relative_to_root if relative_to_root != "." else "",
        "project_root": str(project_root),
    }


@router.post("/fs/create-dir")
def create_directory(payload: dict[str, str]) -> dict[str, Any]:
    name = payload.get("name", "").strip()
    parent = payload.get("parent", "").strip()
    if not name or "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid directory name")
    project_root = Path(__file__).resolve().parents[2]
    parent_path = Path(parent).resolve() if parent else project_root
    new_dir = parent_path / name
    new_dir.mkdir(parents=True, exist_ok=True)
    return {"status": "success", "path": str(new_dir)}


@router.get("/fs/check-output-dir")
def check_output_dir(path: str = "output") -> dict[str, Any]:
    project_root = Path(__file__).resolve().parents[2]
    clean_path = path.strip() if path else "output"
    target_path = Path(clean_path).expanduser()
    if not target_path.is_absolute():
        target_path = (project_root / clean_path).resolve()
    else:
        target_path = target_path.resolve()

    if not target_path.exists() or not target_path.is_dir():
        return {
            "exists": False,
            "file_count": 0,
            "has_artifacts": False,
            "files": [],
        }

    files = [
        f
        for f in target_path.rglob("*")
        if f.is_file()
        and not any(part.startswith(".") for part in f.relative_to(target_path).parts)
    ]
    has_artifacts = any(f.name in OUTPUT_ARTIFACT_FILENAMES for f in files)

    return {
        "exists": True,
        "file_count": len(files),
        "has_artifacts": has_artifacts,
        "files": [str(f.relative_to(target_path)) for f in files[:10]],
    }


@router.post("/fs/clean-output-dir")
def clean_output_dir(payload: dict[str, str]) -> dict[str, Any]:
    project_root = Path(__file__).resolve().parents[2]
    raw_path = payload.get("path", "output").strip()
    target_path = Path(raw_path).expanduser()
    if not target_path.is_absolute():
        target_path = (project_root / raw_path).resolve()
    else:
        target_path = target_path.resolve()

    if (
        target_path == Path("/")
        or target_path == Path.home()
        or target_path == project_root
    ):
        raise HTTPException(status_code=400, detail="Cannot clean protected directory")

    if not target_path.exists() or not target_path.is_dir():
        target_path.mkdir(parents=True, exist_ok=True)
        return {"status": "success", "deleted_count": 0}

    deleted_count = 0
    for item in list(target_path.iterdir()):
        if item.name.startswith("."):
            continue
        if item.is_file():
            try:
                item.unlink()
                deleted_count += 1
            except OSError:
                pass
        elif item.is_dir():
            for sub in item.rglob("*"):
                if sub.is_file():
                    deleted_count += 1
            shutil.rmtree(item, ignore_errors=True)

    return {"status": "success", "deleted_count": deleted_count}


@router.post("/browse")
def browse_system_dialog(payload: BrowseRequest) -> dict[str, Any]:
    env = os.environ.copy()
    mode = payload.mode
    title = payload.title or (
        "Select Output Directory"
        if mode == "directory"
        else "Import Configuration File"
    )

    py_code = (
        "import sys, json\n"
        "from PyQt6.QtWidgets import QApplication, QFileDialog\n"
        "app = QApplication(sys.argv)\n"
    )
    if mode == "directory":
        py_code += (
            f"res = QFileDialog.getExistingDirectory(None, {json.dumps(title)})\n"
            "print(json.dumps({'path': res or ''}), end='')\n"
        )
    elif mode == "files":
        py_code += (
            f"res, _ = QFileDialog.getOpenFileNames(None, {json.dumps(title)}, '', 'JSON Files (*.json);;All Files (*)')\n"
            "print(json.dumps({'files': res or []}), end='')\n"
        )
    else:
        py_code += (
            f"res, _ = QFileDialog.getOpenFileName(None, {json.dumps(title)}, '', 'JSON Files (*.json);;All Files (*)')\n"
            "print(json.dumps({'file': res or ''}), end='')\n"
        )

    try:
        proc = subprocess.run(
            [sys.executable, "-B", "-c", py_code],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            return {"path": "", "files": [], "file": ""}
        result = json.loads(proc.stdout.strip())
    except (subprocess.SubprocessError, OSError, json.JSONDecodeError):
        return {"path": "", "files": [], "file": ""}

    if mode == "directory":
        return {"path": result.get("path", "")}

    if mode == "files":
        raw_files = result.get("files", [])
        parsed_files = []
        for file_path in raw_files:
            fp = Path(file_path)
            if fp.exists() and fp.is_file():
                try:
                    with fp.open("r", encoding="utf-8") as f:
                        data = json.load(f)
                    parsed_files.append(
                        {"path": str(fp), "name": fp.stem, "data": data}
                    )
                except (OSError, json.JSONDecodeError):
                    continue
        return {"files": parsed_files}

    raw_file = result.get("file", "")
    if raw_file:
        fp = Path(raw_file)
        if fp.exists() and fp.is_file():
            try:
                with fp.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                return {"path": str(fp), "name": fp.stem, "data": data}
            except (OSError, json.JSONDecodeError):
                return {"path": str(fp), "name": fp.stem, "data": None}
    return {"path": "", "name": "", "data": None}
