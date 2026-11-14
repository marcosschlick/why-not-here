from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from src.pipeline.reporting import finite_data

from .csv_export import render_csv

router = APIRouter(prefix="/api/benchmarks")


class ResultsExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    records: list[dict[str, Any]] = Field(min_length=1)


FIELDS = (
    "run_id",
    "benchmark_group_id",
    "map_id",
    "prepared_scenario_id",
    "attempt_index",
    "execution_order",
    "model",
    "strategy",
    "reduction",
    "requested_astar_scope",
    "effective_astar_scope",
    "solver",
    "map_height",
    "map_width",
    "connectivity",
    "effective_seed",
    "execution_status",
    "solver_status",
    "stop_reason",
    "validation_status",
    "objective_certified",
    "objective_kind",
    "certificate_scope",
    "candidate_available",
    "deadline_outcome",
    "time_budget_sec",
    "runtime_sec",
    "preparation_sec",
    "model_build_sec",
    "solver_sec",
    "validation_sec",
    "iterations",
    "cuts",
    "interventions_total",
    "interventions_objective_cost",
    "interventions_terrain",
    "interventions_cell_opening",
    "interventions_distinct_cells",
    "interventions_distinct_edges",
    "interventions_physical_obstacle_reasons",
    "interventions_impassable_terrain_reasons",
    "interventions_slope",
    "interventions_environmental_speed",
    "interventions_robot_capability",
    "interventions_slow_to_fast",
    "interventions_fast_to_slow",
    "preparation_converted_blocked_cells",
    "graph_nodes",
    "graph_edges",
    "full_graph_nodes",
    "full_graph_edges",
    "optimal_length_m",
    "alternative_length_m",
    "hausdorff_m",
    "original_optimal_cost",
    "original_optimal_cost_state",
    "original_alternative_cost",
    "original_alternative_cost_state",
    "final_alternative_cost",
    "final_alternative_cost_state",
    "final_optimal_cost",
    "validation_gap_sec",
    "solver_objective",
    "solver_lower_bound",
    "solver_effective_gap",
    "memory_sampled_peak_bytes",
    "error",
)


def export_row(supplied: dict[str, Any]) -> dict[str, Any]:
    from src import config

    from .schemas import SemanticModificationsData

    record = finite_data(supplied)
    metrics = record.get("metrics")
    if not isinstance(metrics, dict) or metrics.get("model") not in {
        "NORMAL",
        "BRANDAO",
    }:
        raise HTTPException(
            status_code=422, detail="Result model metadata is required."
        )
    expected = (
        config.NORMAL_MODEL_VERSION
        if metrics["model"] == "NORMAL"
        else "brandao-grid-v2"
    )
    if metrics.get("model_version") != expected:
        raise HTTPException(
            status_code=422,
            detail="Unsupported result model version. Run the scenario again.",
        )
    if record.get("modifications") is not None:
        try:
            SemanticModificationsData.model_validate(record["modifications"])
        except (TypeError, ValueError) as error:
            raise HTTPException(
                status_code=422, detail="Invalid or incompatible intervention records."
            ) from error
    identity = metrics.get("identity") or {}
    reproduction = metrics.get("reproduction") or {}
    configuration = reproduction.get("configuration") or {}
    timing = metrics.get("timing") or {}
    interventions = metrics.get("interventions") or {}
    preparation = metrics.get("preparation") or {}
    solver = metrics.get("solver") or {}
    memory = metrics.get("memory") or {}
    paths = record.get("path_metrics") or {}
    cost_states = metrics.get("cost_states") or {}
    return {
        **{
            key: identity.get(key)
            for key in (
                "run_id",
                "benchmark_group_id",
                "map_id",
                "prepared_scenario_id",
                "attempt_index",
                "execution_order",
            )
        },
        **{
            key: metrics.get(key)
            for key in (
                "model",
                "strategy",
                "reduction",
                "requested_astar_scope",
                "effective_astar_scope",
                "stop_reason",
                "validation_status",
                "objective_certified",
                "objective_kind",
                "certificate_scope",
                "candidate_available",
                "deadline_outcome",
                "time_budget_sec",
                "cuts",
                "full_graph_nodes",
                "full_graph_edges",
                "final_optimal_cost",
                "validation_gap_sec",
            )
        },
        **{
            key: record.get(key)
            for key in (
                "execution_status",
                "solver_status",
                "runtime_sec",
                "iterations",
                "graph_nodes",
                "graph_edges",
                "original_optimal_cost",
                "original_alternative_cost",
                "final_alternative_cost",
            )
        },
        **{
            key: timing.get(key)
            for key in (
                "preparation_sec",
                "model_build_sec",
                "solver_sec",
                "validation_sec",
            )
        },
        **{
            f"interventions_{key}": interventions.get(key)
            for key in (
                "total",
                "objective_cost",
                "terrain",
                "cell_opening",
                "distinct_cells",
                "distinct_edges",
                "physical_obstacle_reasons",
                "impassable_terrain_reasons",
                "slope",
                "environmental_speed",
                "robot_capability",
                "slow_to_fast",
                "fast_to_slow",
            )
        },
        **{
            key: paths.get(key)
            for key in (
                "optimal_length_m",
                "alternative_length_m",
                "hausdorff_m",
            )
        },
        **{
            f"{key}_cost_state": cost_states.get(key)
            for key in (
                "original_optimal",
                "original_alternative",
                "final_alternative",
            )
        },
        **{
            f"solver_{key}": solver.get(key)
            for key in (
                "objective",
                "lower_bound",
                "effective_gap",
            )
        },
        "solver": configuration.get("DEFAULT_SOLVER"),
        "map_height": configuration.get("MAP_H"),
        "map_width": configuration.get("MAP_W"),
        "connectivity": configuration.get("CONNECTIVITY"),
        "effective_seed": reproduction.get("effective_seed"),
        "preparation_converted_blocked_cells": preparation.get(
            "converted_blocked_cells"
        ),
        "memory_sampled_peak_bytes": memory.get("sampled_peak_bytes"),
        "error": record.get("execution_error") or metrics.get("error"),
    }


@router.post("/export")
def export_results(payload: ResultsExport):
    rows = (export_row(record) for record in payload.records)
    return Response(
        render_csv(rows, FIELDS, missing="NA"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="scenarios.csv"',
            "Cache-Control": "no-store",
        },
    )
