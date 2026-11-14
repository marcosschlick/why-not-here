import json
import time
from datetime import UTC, datetime
from uuid import uuid4

from src import config
from src.grid.grid import Grid
from src.incremental import ClosedLoopResult, ISPValidator, solve_closed_loop
from src.isp.budget import ScenarioBudget, ScenarioDeadlineExceeded
from src.isp.profile import prepare_scenario_grid
from src.pipeline.storage import get_output_directory
from src.visual.appearance import resolve_map_appearance
from src.visual.plotter import render_tactical_map

from .artifact_names import (
    MAP_DATA_FILENAME,
    MAP_DIRECTORY_NAME,
    RESULTS_DIRECTORY_NAME,
)
from .reporting import (
    ScenarioMemory,
    content_id,
    finite_data,
    runtime_versions,
    serialize_result,
)
from .utils import (
    BlockedEndpointError,
    create_alternative_path,
    get_project_path,
    prepare_endpoints,
)


def format_artifact_status(result: ClosedLoopResult) -> str:
    if result.metrics.get("stop_reason") == "COST_MODEL_MISMATCH":
        return f"Execution error: modeled and applied costs differ; physical validation: {result.metrics.get('validation_status')}"
    objective = (
        "weighted intervention cost"
        if result.metrics.get("model") == "BRANDAO"
        else "intervention count"
    )
    if result.metrics.get("objective_certified"):
        return f"Global path validated; minimum {objective} certified in the declared domain"
    if result.success:
        return f"Global path validated; minimum {objective} not certified"
    return f"Candidate not globally validated ({result.metrics.get('stop_reason', result.solver_status)})"


def grid_response(grid: Grid) -> dict:
    from src.visual.layers import find_steep_cells
    from src.visual.style import BRANDAO_TERRAIN_COLORS

    return {
        **grid.to_dict(),
        "terrain_colors": BRANDAO_TERRAIN_COLORS
        if grid.isp_model == "BRANDAO"
        else config.TERRAIN_COLORS,
        "appearance": resolve_map_appearance(grid.h, grid.w),
        "steep_cells": sorted(find_steep_cells(grid)),
    }


def run_isp(
    verbose: bool = True,
    user_path=None,
    start=None,
    goal=None,
    grid: Grid | None = None,
    metadata: dict | None = None,
) -> ClosedLoopResult:
    output = get_project_path(get_output_directory())
    source = (
        grid
        if grid is not None
        else Grid.load(output / MAP_DIRECTORY_NAME / MAP_DATA_FILENAME)
    )
    budget = ScenarioBudget(config.ISP_TIME_BUDGET_SEC)
    memory = ScenarioMemory()
    memory.start()
    started_at = datetime.now(UTC).isoformat()
    prepared = None
    preparation = {}
    p_user = []
    result = None
    try:
        with budget.activate():
            with budget.phase("preparation_sec"):
                start, goal = prepare_endpoints(source, start=start, goal=goal)
                p_user = (
                    [tuple(point) for point in user_path]
                    if user_path is not None
                    else create_alternative_path(source, start, goal)
                )
                prepared, preparation = prepare_scenario_grid(
                    source, config.ISP_MODEL, p_user
                )
                budget.check()
            result = solve_closed_loop(
                prepared,
                start,
                goal,
                p_user,
                solver_name=config.DEFAULT_SOLVER,
                budget=budget,
                reduction_method=config.DEFAULT_REDUCTION_METHOD,
                astar_scope=config.INCREMENTAL_ASTAR_SCOPE,
                incremental=config.USE_INCREMENTAL_SOLVER,
            )
    except (
        ScenarioDeadlineExceeded,
        ValueError,
        RuntimeError,
        KeyError,
        MemoryError,
    ) as exc:
        result = ClosedLoopResult(
            False, None, str(exc), 0, 0, [], float("inf"), float("inf"), 0.0, "NOT_RUN"
        )
        result.metrics.update(
            stop_reason="TIME_BUDGET_EXHAUSTED"
            if isinstance(exc, ScenarioDeadlineExceeded)
            else "BLOCKED_ENDPOINT"
            if isinstance(exc, BlockedEndpointError)
            else "ERROR",
            validation_status="NOT_RUN",
            objective_certified=False,
            objective_kind="WEIGHTED_INTERVENTION_COST"
            if config.ISP_MODEL == "BRANDAO"
            else "INTERVENTION_COUNT",
            error=None if isinstance(exc, BlockedEndpointError) else str(exc),
        )
    finally:
        elapsed = budget.elapsed_sec
        memory_metrics = memory.finish()
    result.runtime_sec = elapsed
    result.prepared_grid = prepared
    metrics = result.metrics
    metrics.setdefault("requested_astar_scope", config.INCREMENTAL_ASTAR_SCOPE if config.USE_INCREMENTAL_SOLVER else None)
    metrics.setdefault("effective_astar_scope", None)
    stop = metrics.get("stop_reason")
    overrun = elapsed > budget.limit_sec
    metrics.update(
        timing={
            **budget.timings,
            "total_sec": elapsed,
            "overhead_sec": max(0.0, elapsed - sum(budget.timings.values())),
        },
        time_budget_sec=budget.limit_sec,
        deadline_exceeded=overrun,
        deadline_outcome="STOPPED_AT_BUDGET"
        if stop == "TIME_BUDGET_EXHAUSTED"
        else "COMPLETED_AFTER_BUDGET"
        if overrun
        else "WITHIN_BUDGET",
        result_within_budget=bool(result.success and not overrun),
        validated_after_deadline=bool(
            result.success
            and metrics.get("validation_finished_elapsed_sec", elapsed)
            > budget.limit_sec
        ),
        memory=memory_metrics,
        preparation=preparation,
        model=config.ISP_MODEL,
        model_version=prepared.isp_model_version
        if prepared is not None
        else (
            config.NORMAL_MODEL_VERSION
            if config.ISP_MODEL == "NORMAL"
            else "brandao-grid-v2"
        ),
        strategy="INCREMENTAL" if config.USE_INCREMENTAL_SOLVER else "MONOLITHIC",
        reduction=config.DEFAULT_REDUCTION_METHOD,
    )
    from .experiment_config import get_experiment_configurations

    parameters = get_experiment_configurations()
    source_id = content_id(source.to_dict())
    prepared_id = (
        content_id(
            {
                "grid": prepared.to_dict(),
                "start": start,
                "goal": goal,
                "desired_path": p_user,
                "tolerance_sec": config.INCREMENTAL_TOLERANCE,
                "robot_speed_eligibility_ratio": config.ROBOT_SPEED_ELIGIBILITY_RATIO,
                "formulation_version": prepared.isp_model_version
                if prepared is not None
                else None,
            }
        )
        if prepared is not None
        else None
    )
    metadata = metadata or {}
    metrics["map_generation_sec"] = metadata.get(
        "map_generation_sec", getattr(source, "generation_runtime_sec", None)
    )
    metrics["execution_order_scope"] = (
        "caller_session" if "execution_order" in metadata else "single_execution"
    )
    metrics["identity"] = {
        "run_id": metadata.get("run_id") or str(uuid4()),
        "map_id": source_id,
        "prepared_scenario_id": prepared_id,
        "scenario_id": content_id({"prepared": prepared_id, "parameters": parameters}),
        "benchmark_group_id": metadata.get("benchmark_group_id"),
        "attempt_index": metadata.get("attempt_index", 1),
        "execution_order": metadata.get("execution_order", 1),
        "started_at": started_at,
        "finished_at": datetime.now(UTC).isoformat(),
    }
    metrics["reproduction"] = {
        "configuration": parameters,
        "start": start,
        "goal": goal,
        "desired_path": p_user,
        "base_seed": source.base_seed,
        "effective_seed": source.effective_seed,
        "generation_attempt": source.generation_attempt,
        "generation_profile": source.generation_profile,
        "versions": runtime_versions(),
        "formulation_version": prepared.isp_model_version
        if prepared is not None
        else None,
        "requested_mip_gap": config.MIP_GAP_TOLERANCE,
        "optimality_tolerance_sec": config.INCREMENTAL_TOLERANCE,
        "robot_speed_eligibility_ratio": config.ROBOT_SPEED_ELIGIBILITY_RATIO,
    }
    results = output / RESULTS_DIRECTORY_NAME
    results.mkdir(parents=True, exist_ok=False)
    report_path = results / "scenario.json"

    def persist_report():
        report_path.write_text(
            json.dumps(serialize_result(result), indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )

    persist_report()
    artifact_started = time.perf_counter_ns()
    try:
        if prepared is not None:
            prepared.save(results / "prepared_map.json")
            target = (
                ISPValidator.apply_modifications(prepared, result.modifications)
                if result.modifications is not None
                else prepared
            )
            target.save(results / "candidate_map.json")
            status = format_artifact_status(result)
            profile = (
                "Brandao adaptation: fast/slow 1:8, fixed obstacles, no slope effects"
                if config.ISP_MODEL == "BRANDAO"
                else "Normal traversal model"
            )
            if metrics.get("stop_reason") == "COST_MODEL_MISMATCH":
                profile = f"{profile}; {status}"
            for filename, title, optimal, desired in (
                (
                    "optimal_path.png",
                    "Prepared optimal path",
                    result.original_optimal_path,
                    None,
                ),
                ("alternative_path.png", "Prepared alternative path", None, p_user),
                (
                    "path_comparison.png",
                    "Prepared path comparison",
                    result.original_optimal_path,
                    p_user,
                ),
            ):
                render_tactical_map(
                    prepared,
                    optimal_path=optimal,
                    user_path=desired,
                    title=title,
                    save_path=results / filename,
                    subtitle=profile,
                )
            if result.modifications is not None:
                for filename, paths in (
                    ("changes.png", False),
                    ("changes_and_paths.png", True),
                ):
                    render_tactical_map(
                        prepared,
                        optimal_path=result.original_optimal_path if paths else None,
                        user_path=p_user if paths else None,
                        modifications=result.modifications,
                        modified_grid=target,
                        endpoints=(start, goal),
                        title="Candidate interventions",
                        subtitle=f"{profile}; {status}",
                        save_path=results / filename,
                    )
    except (ValueError, RuntimeError, OSError, MemoryError) as exc:
        metrics["artifact_error"] = str(exc)
    metrics["artifact_sec"] = (time.perf_counter_ns() - artifact_started) / 1e9
    persist_report()
    log = (
        f"Model: {metrics['model']} | Strategy: {metrics['strategy']} | Reduction: {metrics['reduction']}\n"
        f"Stop reason: {stop} | Solver: {result.solver_status}\n"
        f"Validation: {metrics.get('validation_status')} | Objective: {metrics.get('objective_kind')} | Certified: {metrics.get('objective_certified', False)} | Intervention cost: {(metrics.get('interventions') or {}).get('objective_cost')}\n"
        f"Deadline: {metrics['deadline_outcome']} | Total ISP: {elapsed!r} s\n"
        f"{result.explanation_text}\n"
        f"Structured metrics: {report_path.name}\n"
    )
    (results / "log.txt").write_text(log, encoding="utf-8")
    if verbose:
        print(log)
    result.metrics = finite_data(metrics)
    return result
