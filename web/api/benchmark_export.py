import json
from typing import Any, Literal

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from src.pipeline.reporting import finite_data

from .csv_export import render_csv

router = APIRouter(prefix="/api/benchmarks")


class ResultsExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    records: list[dict[str, Any]] = Field(min_length=1)
    kind: Literal["scenarios", "iterations"] = "scenarios"


def flatten(value: dict, prefix: str = "") -> dict:
    row = {}
    for key, item in value.items():
        name = f"{prefix}_{key}" if prefix else key
        if isinstance(item, dict):
            row.update(flatten(item, name))
        elif isinstance(item, list):
            row[name] = json.dumps(
                item, separators=(",", ":"), ensure_ascii=False, allow_nan=False
            )
        else:
            row[name] = item
    return row


SUMMARY_FIELDS = (
    "identity_run_id",
    "identity_map_id",
    "identity_prepared_scenario_id",
    "identity_scenario_id",
    "identity_benchmark_group_id",
    "identity_repetition_index",
    "identity_attempt_index",
    "identity_execution_order",
    "identity_started_at",
    "identity_finished_at",
    "model",
    "strategy",
    "reduction",
    "solver_status",
    "stop_reason",
    "success",
    "validation_status",
    "cardinality_certified",
    "certificate_scope",
    "certificate_reason",
    "deadline_outcome",
    "time_budget_sec",
    "deadline_exceeded",
    "result_within_budget",
    "validated_after_deadline",
    "candidate_available",
    "candidate_from_solver_limit",
    "runtime_sec",
    "original_optimal_cost",
    "original_alternative_cost",
    "final_alternative_cost",
    "final_original_path_cost",
    "final_optimal_cost",
    "validation_gap_sec",
    "iterations",
    "competing_paths_count",
    "cuts",
    "graph_nodes",
    "graph_edges",
    "full_graph_nodes",
    "full_graph_edges",
    "reproduction_configuration_json",
    "reproduction_desired_path",
    "error",
)
SUMMARY_FIELDS += (
    "timing_preparation_sec",
    "timing_model_build_sec",
    "timing_solver_sec",
    "timing_validation_sec",
    "timing_total_sec",
    "timing_overhead_sec",
    "solver_objective",
    "solver_lower_bound",
    "solver_effective_gap",
    "solver_requested_mip_gap",
    "solver_variables",
    "solver_constraints",
    "solver_integer_variables",
    "solver_canonical_variables",
    "solver_canonical_constraints",
    "solver_native_status",
    "solver_native_solver_sec",
    "solver_solver_time_limit_sec",
    "solver_bound_usable",
    "node_reduction_ratio",
    "edge_reduction_ratio",
    "initial_astar_expanded",
    "validation_astar_expanded",
    "interventions_total",
    "interventions_distinct_cells",
    "interventions_terrain",
    "interventions_obstacle",
    "interventions_opened_terrain",
    "interventions_slope",
    "interventions_robot_speed",
    "interventions_slow_to_fast",
    "interventions_fast_to_slow",
    "preparation_version",
    "preparation_converted_blocked_cells",
    "preparation_converted_nodes",
    "memory_sampled_peak_bytes",
    "memory_initial_bytes",
    "memory_sampling_interval_sec",
    "memory_method",
    "memory_exact_scenario_peak_bytes",
    "path_metrics_optimal_length_cells",
    "path_metrics_optimal_length_m",
    "path_metrics_alternative_length_cells",
    "path_metrics_alternative_length_m",
    "path_metrics_hausdorff_cells",
    "path_metrics_hausdorff_m",
    "reproduction_base_seed",
    "reproduction_effective_seed",
    "reproduction_start",
    "reproduction_goal",
    "reproduction_formulation_version",
    "candidate_observed_elapsed_sec",
    "candidate_observed_after_deadline",
    "validation_finished_elapsed_sec",
    "map_generation_sec",
    "artifact_sec",
)
ITERATION_FIELDS = (
    "identity_run_id",
    "identity_scenario_id",
    "identity_repetition_index",
    "identity_execution_order",
    "iteration",
)


ITERATION_FIELDS += (
    "solver_status",
    "stop_reason",
    "solver_attempted",
    "completed",
    "candidate_available",
    "preparation_sec",
    "model_build_sec",
    "solver_sec",
    "validation_sec",
    "competing_paths_before",
    "competing_paths_after",
    "cut_added",
    "graph_nodes",
    "graph_edges",
    "solver_objective",
    "solver_lower_bound",
    "solver_effective_gap",
)


def export_rows(records: list[dict], kind: str):
    for supplied in records:
        record = finite_data(supplied)
        metrics = record.get("metrics") or {}
        if kind == "iterations":
            for iteration in record.get("iteration_metrics") or []:
                yield {
                    **flatten({"identity": metrics.get("identity", {})}),
                    **flatten(iteration),
                }
        else:
            base = {
                key: value
                for key, value in record.items()
                if key
                not in {
                    "metrics",
                    "iteration_metrics",
                    "modified_grid",
                    "prepared_grid",
                }
            }
            row = {**flatten(base), **flatten(metrics)}
            row["reproduction_configuration_json"] = json.dumps(
                metrics.get("reproduction", {}).get("configuration"),
                sort_keys=True,
                separators=(",", ":"),
                allow_nan=False,
            )
            yield row


@router.post("/export")
def export_results(payload: ResultsExport):
    rows = list(export_rows(payload.records, payload.kind))
    fixed = SUMMARY_FIELDS if payload.kind == "scenarios" else ITERATION_FIELDS
    fields = fixed + tuple(
        sorted(set().union(*(row.keys() for row in rows)) - set(fixed))
    )
    return Response(
        render_csv(rows, fields, missing="NA"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{payload.kind}.csv"',
            "Cache-Control": "no-store",
        },
    )
