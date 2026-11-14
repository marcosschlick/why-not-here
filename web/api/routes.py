import math
from collections.abc import Callable
from functools import wraps
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, HTTPException

from src import config
from src.grid import Grid
from src.incremental import ISPValidator
from src.isp.precheck import validate_alternative_path
from src.map.profiles import map_profiles
from src.pipeline.artifact_names import (
    MAP_DIRECTORY_NAME,
    MAP_IMAGE_FILENAME,
)
from src.pipeline.experiment_config import (
    apply_experiment_config,
    build_experiment_config,
    save_experiment_configurations,
    validate_experiment_config,
)
from src.pipeline.generate_map import generate_map, persist_map
from src.pipeline.run_isp import run_isp
from src.pipeline.storage import (
    get_output_directory,
    reserve_output_directory,
    set_output_directory,
)
from src.pipeline.utils import (
    create_alternative_path,
    get_project_path,
    prepare_endpoints,
)
from src.planning import astar
from src.visual.appearance import resolve_map_appearance
from src.visual.layers import find_steep_cells

from .artifacts import collect_artifacts
from .config_manager import get_experiment_configurations, update_configurations
from .runner import runner
from .schemas import (
    ExportConfigRequest,
    GenerateMapRequest,
    ImportConfigRequest,
    RunRequest,
    SaveConfigurationsRequest,
    SemanticModificationsData,
    SolveISPRequest,
)

router = APIRouter(prefix="/api")


def exclusive_pipeline(function: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(function)
    def execute(*args: Any, **kwargs: Any) -> Any:
        if not runner.execution_lock.acquire(blocking=False):
            raise HTTPException(
                status_code=409, detail="Pipeline execution already in progress."
            )
        try:
            return function(*args, **kwargs)
        finally:
            runner.execution_lock.release()

    return execute


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
        f"?dir={quote(str(get_output_directory()), safe='')}"
    )


def _grid_layers(grid: Grid) -> dict[str, Any]:
    return {
        "cell_size": grid.cell_size,
        "max_slope_deg": grid.max_slope_deg,
        "speeds": grid.speeds,
        "terrain_colors": config.TERRAIN_COLORS,
        "appearance": resolve_map_appearance(grid.h, grid.w),
        "terrain_overrides": sorted(grid.terrain_overrides),
        "generation_profile": grid.generation_profile,
        "steep_cells": sorted(find_steep_cells(grid)),
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


@router.get("/map-profiles")
def read_map_profiles() -> list[dict]:
    return map_profiles()


@router.get("/config")
def read_config() -> dict[str, Any]:
    return get_experiment_configurations()


@router.post("/config")
@exclusive_pipeline
def modify_config(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        updated_items = update_configurations(payload)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "success", "updated": updated_items}


@router.post("/config/export")
@exclusive_pipeline
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
@exclusive_pipeline
def save_configurations_endpoint(
    payload: SaveConfigurationsRequest,
) -> dict[str, Any]:
    configurations = [item.model_dump() for item in payload.configurations]
    try:
        saved_files = save_experiment_configurations(
            configurations=configurations,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save configuration files: {exc!s}",
        ) from exc
    return {"status": "success", "saved_files": saved_files}


@router.post("/config/import")
@exclusive_pipeline
def import_configuration_endpoint(payload: ImportConfigRequest) -> dict[str, Any]:
    raw_data = payload.model_dump(exclude_unset=True)
    try:
        params, start, goal, p_user = validate_experiment_config(raw_data)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.persist_artifacts:
        try:
            set_output_directory(
                reserve_output_directory(params["MAP_H"], params["MAP_W"])
            )
        except (ValueError, OSError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

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

        optimal_path, optimal_cost, _ = astar(grid, start, goal)

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
            "config": get_experiment_configurations(),
            "generation": _generation_metadata(grid),
            "grid": grid.to_dict(),
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
@exclusive_pipeline
def generate_map_endpoint(payload: GenerateMapRequest) -> dict[str, Any]:
    return generate_map_data(payload)


def generate_map_data(payload: GenerateMapRequest) -> dict[str, Any]:
    persist_artifacts = payload.persist_artifacts
    updates: dict[str, Any] = payload.model_dump(exclude_unset=True, exclude_none=True)
    updates.pop("persist_artifacts", None)
    if "extra_config" in updates:
        extra = updates.pop("extra_config")
        if isinstance(extra, dict):
            updates.update(extra)

    if persist_artifacts:
        try:
            set_output_directory(
                reserve_output_directory(
                    updates.get("MAP_H", config.MAP_H),
                    updates.get("MAP_W", config.MAP_W),
                )
            )
        except (ValueError, OSError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

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
        optimal_path, optimal_cost, _ = astar(grid, start, goal)

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
            "config": get_experiment_configurations(),
            "generation": _generation_metadata(grid),
            "grid": grid.to_dict(),
        }
        return sanitize_floats(response_data)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate map: {exc!s}"
        ) from exc


@router.post("/isp/solve")
@exclusive_pipeline
def solve_isp_endpoint(payload: SolveISPRequest) -> dict[str, Any]:
    return solve_isp_data(payload)


def solve_isp_data(payload: SolveISPRequest) -> dict[str, Any]:
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

    p_user = None
    if payload.user_path is not None:
        p_user = [tuple(p) for p in payload.user_path]

    with runner.lock:
        runner.state["last_result"] = None
        runner.state["artifacts"] = []
        runner.state["error"] = None
        runner.state["status"] = "solving"

    try:
        grid = (
            Grid.from_dict(payload.map)
            if payload.map is not None
            else Grid.load(
                get_project_path(get_output_directory()) / "map" / "map.json"
            )
        )
        naming = payload.naming.model_dump() if payload.naming else {}
        output_dir = reserve_output_directory(
            grid.h,
            grid.w,
            **naming,
            incremental=config.USE_INCREMENTAL_SOLVER,
            reduction=config.DEFAULT_REDUCTION_METHOD,
        )
        set_output_directory(output_dir)
        persist_map(grid, start=start, goal=goal)
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
                opened_terrain=len(result.modifications.opened_terrain_nodes),
                opened_terrain_nodes=result.modifications.opened_terrain_nodes,
                robot_speed=len(result.modifications.robot_speed_edges),
                terrain_nodes=result.modifications.terrain_nodes,
                obstacle_nodes=result.modifications.obstacle_nodes,
                slope_edges=result.modifications.slope_edges,
                terrain_assignments=result.modifications.terrain_assignments,
                robot_speed_edges=result.modifications.robot_speed_edges,
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
            "original_optimal_path": result.original_optimal_path,
            "original_alternative_cost": (
                ISPValidator.compute_path_cost(
                    Grid.load(
                        get_project_path(get_output_directory()) / "map" / "map.json"
                    ),
                    p_user,
                )
                if p_user
                else None
            ),
            "solver_status": result.solver_status,
            "runtime_sec": runtime,
            "iterations": result.iterations,
            "graph_nodes": result.graph_nodes,
            "graph_edges": result.graph_edges,
            "path_metrics": result.path_metrics,
            "iteration_metrics": result.iteration_metrics,
            "original_optimal_cost": orig_cost,
            "final_alternative_cost": final_cost,
            "explanation_text": result.explanation_text,
            "cost_baseline_text": result.cost_baseline_text,
            "modifications": modifications,
        }

        if result.modifications is not None:
            map_json_path = (
                get_project_path(get_output_directory()) / "map" / "map.json"
            )
            original_grid = Grid.load(map_json_path)
            prepare_endpoints(original_grid, start=start, goal=goal)
            modified_grid = ISPValidator.apply_modifications(
                original_grid, result.modifications
            )
            last_result["modified_grid"] = {
                **modified_grid.to_dict(),
                **_grid_layers(modified_grid),
            }

        artifacts = collect_artifacts(get_output_directory())

        sanitized_result = sanitize_floats(last_result)

        with runner.lock:
            runner.state["last_result"] = sanitized_result
            runner.state["artifacts"] = artifacts
            runner.state["status"] = "completed"

        return {
            "status": "success",
            "result": sanitized_result,
            "artifacts": artifacts,
            "output_dir": str(output_dir),
        }
    except Exception as exc:
        with runner.lock:
            runner.state["error"] = str(exc)
            runner.state["status"] = "failed"
        if isinstance(exc, HTTPException):
            raise
        if isinstance(exc, FileExistsError):
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        if isinstance(exc, (TypeError, ValueError)):
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if isinstance(exc, FileNotFoundError):
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        raise HTTPException(
            status_code=500, detail=f"Error executing ISP solver: {exc!s}"
        ) from exc


@router.post("/run")
def execute_pipeline(payload: RunRequest) -> dict[str, Any]:
    if runner.is_running():
        raise HTTPException(
            status_code=409, detail="Pipeline execution already in progress"
        )
    try:
        runner.start(payload.runs)
    except (RuntimeError, FileExistsError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to create output directory: {exc}"
        ) from exc
    return {"status": "started", "runs": payload.runs}


@router.get("/status")
def fetch_status() -> dict[str, Any]:
    return runner.get_status()
