import math
from itertools import count, pairwise

from src import config
from src.grid.grid import Grid
from src.isp.budget import ScenarioBudget, ScenarioDeadlineExceeded, current_budget
from src.isp.precheck import validate_alternative_path
from src.isp.semantics import edge_is_possible
from src.isp.solver import ISPSolver
from src.isp.types import SemanticModifications
from src.pipeline.path_metrics import measure_paths
from src.planning.astar import astar
from src.reduction import create_reduced_graph, prepare_subgraph

from .explanation import generate_cost_baseline_justification, generate_explanation_text
from .result import ClosedLoopResult
from .step_solver import IncrementalISPSolver
from .validator import ISPValidator


def intervention_counts(modifications, grid: Grid) -> dict:
    if modifications is None:
        return {"total": None, "distinct_cells": None}
    terrain = len(modifications.terrain_nodes)
    counts = {
        "terrain": terrain,
        "obstacle": len(modifications.obstacle_nodes),
        "opened_terrain": len(modifications.opened_terrain_nodes),
        "slope": len(modifications.slope_edges),
        "robot_speed": len(modifications.robot_speed_edges),
        "slow_to_fast": sum(
            grid.get_cell(node).terrain == "FOREST" and target == "GRASS"
            for node, target in modifications.terrain_assignments
        )
        if grid.isp_model == "BRANDAO"
        else None,
        "fast_to_slow": sum(
            grid.get_cell(node).terrain == "GRASS" and target == "FOREST"
            for node, target in modifications.terrain_assignments
        )
        if grid.isp_model == "BRANDAO"
        else None,
    }
    counts["total"] = sum(
        counts[key]
        for key in ("terrain", "obstacle", "opened_terrain", "slope", "robot_speed")
    )
    counts["distinct_cells"] = len(
        set(modifications.terrain_nodes)
        | set(modifications.obstacle_nodes)
        | set(modifications.opened_terrain_nodes)
    )
    return counts


class ClosedLoopISPSolver:
    def __init__(
        self,
        solver_name: str | None = None,
        budget: ScenarioBudget | None = None,
        tolerance: float | None = None,
        reduction_method: str | None = None,
        astar_scope: str | None = None,
        incremental: bool = True,
    ):
        self.solver_name = solver_name or config.DEFAULT_SOLVER
        self.budget = (
            budget or current_budget() or ScenarioBudget(config.ISP_TIME_BUDGET_SEC)
        )
        self.tolerance = (
            config.INCREMENTAL_TOLERANCE if tolerance is None else tolerance
        )
        self.reduction_method = reduction_method or config.DEFAULT_REDUCTION_METHOD
        self.astar_scope = astar_scope or config.INCREMENTAL_ASTAR_SCOPE
        self.incremental = incremental

    def solve(
        self,
        full_grid: Grid,
        start,
        goal,
        alternative_path,
        reduction_method=None,
        astar_scope=None,
    ) -> ClosedLoopResult:
        method = reduction_method or self.reduction_method
        scope = "GLOBAL" if method == "NONE" else (astar_scope or self.astar_scope)
        result = ClosedLoopResult(
            False,
            None,
            "",
            0,
            0,
            [],
            float("inf"),
            float("inf"),
            0.0,
            "NOT_RUN",
            reduction_method=method,
        )
        metrics = result.metrics
        metrics.update(
            model=full_grid.isp_model,
            strategy="INCREMENTAL" if self.incremental else "MONOLITHIC",
            reduction=method,
            astar_scope=scope,
            tolerance_sec=self.tolerance,
            validation_status="NOT_RUN",
            stop_reason="NOT_RUN",
            cardinality_certified=False,
            certificate_scope=None,
            certificate_reason="No verified lower-bound/candidate pair is available.",
            original_alternative_cost=None,
            final_original_path_cost=None,
            final_optimal_cost=None,
            validation_gap_sec=None,
            candidate_from_solver_limit=False,
            candidate_available=False,
            solver={},
        )
        solver = (IncrementalISPSolver if self.incremental else ISPSolver)(
            solver_name=self.solver_name, budget=self.budget, tolerance=self.tolerance
        )
        last_candidate = None
        competing = []
        try:
            with self.budget.activate():
                with self.budget.phase("preparation_sec"):
                    self.budget.check()
                    valid, status, message = validate_alternative_path(
                        full_grid, start, goal, alternative_path
                    )
                    if not valid:
                        result.solver_status = status
                        result.explanation_text = message
                        metrics["stop_reason"] = status
                        return result
                    original, cost, expanded = astar(full_grid, start, goal)
                    result.original_optimal_path = original or []
                    result.original_optimal_cost = cost
                    initial_alt = ISPValidator.compute_path_cost(
                        full_grid, alternative_path
                    )
                    metrics.update(
                        original_alternative_cost=initial_alt,
                        initial_astar_expanded=expanded,
                        cost_states={
                            "original_optimal": "FINITE"
                            if math.isfinite(cost)
                            else "UNREACHABLE",
                            "original_alternative": "FINITE"
                            if math.isfinite(initial_alt)
                            else "IMPASSABLE",
                        },
                    )
                    result.cost_baseline_text = generate_cost_baseline_justification(
                        cost, initial_alt
                    )
                    if original:
                        result.path_metrics = measure_paths(
                            original, alternative_path, full_grid.cell_size
                        )
                        competing.append(original)
                    path_nodes = set(alternative_path)
                    path_edges = set(pairwise(alternative_path))
                    full_edges = 0
                    for row in range(full_grid.h):
                        self.budget.check()
                        for col in range(full_grid.w):
                            node = (row, col)
                            full_edges += sum(
                                edge_is_possible(
                                    full_grid, (node, neighbor), path_nodes, path_edges
                                )
                                for neighbor in full_grid.get_neighbors(node)
                            )
                    metrics.update(
                        full_graph_nodes=full_grid.h * full_grid.w,
                        full_graph_edges=full_edges,
                    )
                    reduced = create_reduced_graph(
                        full_grid,
                        original or alternative_path,
                        alternative_path,
                        method=method,
                    )
                if start == goal and len(alternative_path) == 1:
                    last_candidate = SemanticModifications([], [], [])
                    result.success = True
                    result.solver_status = "NOT_REQUIRED"
                    result.final_alternative_cost = 0.0
                    metrics.update(
                        validation_status="VALID",
                        stop_reason="ALREADY_OPTIMAL",
                        final_optimal_cost=0.0,
                        final_original_path_cost=0.0,
                        validation_gap_sec=0.0,
                        cardinality_certified=True,
                        validation_finished_elapsed_sec=self.budget.elapsed_sec,
                        certificate_scope="FULL_GRID_DOMAIN",
                        certificate_reason="Zero changes attain the nonnegative objective lower bound.",
                    )
                else:
                    for iteration in count(1):
                        self.budget.check()
                        metric = {
                            "iteration": iteration,
                            "completed": False,
                            "solver_attempted": False,
                            "competing_paths_before": len(competing),
                            "competing_paths_after": len(competing),
                            "cut_added": False,
                        }
                        result.iteration_metrics.append(metric)
                        result.iterations = iteration
                        before = dict(self.budget.timings)
                        if self.incremental:
                            usable, candidate, _ = solver.solve_step(
                                full_grid,
                                start,
                                goal,
                                alternative_path,
                                competing,
                                reduced_graph=reduced,
                            )
                        else:
                            usable, candidate, _ = solver.solve(
                                full_grid,
                                start,
                                goal,
                                alternative_path,
                                reduced_graph=reduced,
                            )
                        result.iterations = iteration
                        result.graph_nodes, result.graph_edges = (
                            solver.last_graph_nodes,
                            solver.last_graph_edges,
                        )
                        result.solver_status = (
                            solver.last_solver_status or "SOLVER_FAILED"
                        )
                        metrics["solver"] = dict(solver.statistics)
                        metric.update(
                            solver_attempted=bool(
                                solver.statistics.get("solver_called")
                            ),
                            solver_status=result.solver_status,
                            graph_nodes=result.graph_nodes,
                            graph_edges=result.graph_edges,
                            solver=dict(solver.statistics),
                        )
                        limited = result.solver_status in {
                            "TIME_LIMIT",
                            "INTERRUPTED",
                            "SOLVER_LIMIT",
                        }
                        if usable and candidate is not None:
                            last_candidate = candidate
                            metrics["candidate_iteration"] = iteration
                            metrics["candidate_from_solver_limit"] = limited
                            metrics.update(
                                validation_status="NOT_RUN",
                                validation_finished_elapsed_sec=None,
                                candidate_observed_elapsed_sec=self.budget.elapsed_sec,
                                candidate_observed_after_deadline=self.budget.remaining_sec
                                <= 0.0,
                                final_original_path_cost=None,
                                final_optimal_cost=None,
                                validation_gap_sec=None,
                            )
                            result.final_alternative_cost = float("inf")
                        if not usable or candidate is None:
                            metrics["stop_reason"] = result.solver_status
                            break
                        self.budget.check()
                        with self.budget.phase("validation_sec"):
                            metrics["validation_status"] = "INCOMPLETE"
                            modified = ISPValidator.apply_modifications(
                                full_grid, candidate
                            )
                            alt_cost = ISPValidator.compute_path_cost(
                                modified, alternative_path
                            )
                            result.final_alternative_cost = alt_cost
                            metrics["cost_states"]["final_alternative"] = (
                                "FINITE" if math.isfinite(alt_cost) else "IMPASSABLE"
                            )
                            formulation = solver.last_formulation
                            consistent = True
                            for edge_index, edge in enumerate(formulation.isp.edges):
                                if edge_index % 256 == 0:
                                    self.budget.check()
                                if edge in formulation.isp.custom_edge_costs:
                                    physical_path = (
                                        reduced.custom_edge_paths.get(edge)
                                        if reduced is not None
                                        else None
                                    )
                                    physical_cost = (
                                        ISPValidator.compute_path_cost(
                                            modified, physical_path
                                        )
                                        if physical_path
                                        else float("inf")
                                    )
                                else:
                                    physical_cost = modified.get_cost(*edge)
                                modeled_cost = float(
                                    formulation.w_prime.value[edge_index]
                                )
                                if (
                                    not math.isfinite(physical_cost)
                                    or abs(modeled_cost - physical_cost) > 1e-5
                                ):
                                    consistent = False
                                    metrics["cost_model_mismatch"] = {
                                        "edge": edge,
                                        "modeled_cost": modeled_cost,
                                        "applied_cost": physical_cost,
                                    }
                                    break
                            metrics["cost_expression_consistent"] = consistent
                            final_path, final_cost, expanded = astar(
                                modified, start, goal
                            )
                            metrics["validation_astar_expanded"] = (
                                metrics.get("validation_astar_expanded", 0) + expanded
                            )
                            result.final_alternative_cost = alt_cost
                            metrics.update(
                                final_optimal_cost=final_cost,
                                final_optimal_path=final_path,
                                final_original_path_cost=ISPValidator.compute_path_cost(
                                    modified, original
                                )
                                if original
                                else None,
                                validation_gap_sec=alt_cost - final_cost
                                if math.isfinite(alt_cost) and math.isfinite(final_cost)
                                else None,
                            )
                            globally_valid = bool(
                                final_path
                                and math.isfinite(alt_cost)
                                and alt_cost <= final_cost + self.tolerance
                            )
                            metrics["validation_status"] = (
                                "VALID" if globally_valid else "INVALID"
                            )
                            metrics["cost_states"].update(
                                final_alternative="FINITE"
                                if math.isfinite(alt_cost)
                                else "IMPASSABLE",
                                final_optimal="FINITE"
                                if math.isfinite(final_cost)
                                else "UNREACHABLE",
                                final_original_path="FINITE"
                                if metrics["final_original_path_cost"] is not None
                                and math.isfinite(metrics["final_original_path_cost"])
                                else "NOT_AVAILABLE",
                            )
                            metrics["validation_finished_elapsed_sec"] = (
                                self.budget.elapsed_sec
                            )
                        metric["completed"] = True
                        if not metrics["cost_expression_consistent"]:
                            result.success = False
                            metrics["stop_reason"] = "COST_MODEL_MISMATCH"
                            break
                        if globally_valid:
                            result.success = True
                            metrics["stop_reason"] = (
                                "VALIDATED_AFTER_SOLVER_LIMIT"
                                if limited
                                else "GLOBAL_PATH_VALIDATED"
                            )
                            counts = intervention_counts(candidate, full_grid)
                            objective, bound = (
                                solver.statistics.get("objective"),
                                solver.statistics.get("lower_bound"),
                            )
                            verified = bool(
                                method == "NONE"
                                and solver.statistics.get("bound_usable")
                                and metrics.get("cost_expression_consistent")
                                and objective is not None
                                and abs(objective - counts["total"]) <= 1e-5
                                and bound is not None
                                and bound <= counts["total"] + 1e-6
                                and bound > counts["total"] - 1 + 1e-6
                            )
                            metrics.update(
                                cardinality_certified=verified,
                                certificate_scope="FULL_GRID_DOMAIN"
                                if verified
                                else None,
                                certificate_reason="A valid master lower bound excludes every smaller integer objective in the declared domain."
                                if verified
                                else "Global path validation does not establish minimum intervention cardinality; a trustworthy matching bound and full-domain formulation are required.",
                            )
                            break
                        if limited or not self.incremental:
                            metrics["stop_reason"] = (
                                result.solver_status
                                if limited
                                else "GLOBAL_VALIDATION_FAILED"
                            )
                            break
                        if scope == "SUBGRAPH":
                            with self.budget.phase("validation_sec"):
                                nodes, edges, costs = prepare_subgraph(
                                    full_grid, alternative_path, reduced
                                )
                                competitor, sub_cost, _ = astar(
                                    modified,
                                    start,
                                    goal,
                                    active_nodes=nodes,
                                    active_edges=edges,
                                    custom_edge_costs=costs,
                                )
                                if alt_cost <= sub_cost + self.tolerance:
                                    metrics["stop_reason"] = "SUBGRAPH_OPTIMAL_ONLY"
                                    break
                                competitor = reduced.expand_path(competitor or [])
                        else:
                            competitor = final_path
                        if not competitor:
                            metrics["stop_reason"] = "DISCONNECTED_GRAPH"
                            break
                        if competitor in competing:
                            metrics["stop_reason"] = "STALLED_OR_CYCLE"
                            break
                        competing.append(competitor)
                        metric.update(
                            cut_added=True, competing_paths_after=len(competing)
                        )
                        for key, value in self.budget.timings.items():
                            metric[key] = value - before[key]
        except ScenarioDeadlineExceeded:
            metrics["solver"] = dict(solver.statistics)
            result.graph_nodes, result.graph_edges = (
                solver.last_graph_nodes,
                solver.last_graph_edges,
            )
            result.solver_status = solver.last_solver_status or "NOT_RUN"
            metrics["stop_reason"] = "TIME_BUDGET_EXHAUSTED"
        except (ValueError, RuntimeError, KeyError, MemoryError, TypeError) as exc:
            metrics.update(stop_reason="ERROR", error=str(exc))
        finally:
            result.modifications = last_candidate
            result.competing_paths_count = len(competing)
            metrics["candidate_available"] = last_candidate is not None
            metrics["interventions"] = intervention_counts(last_candidate, full_grid)
            if last_candidate is None and "cost_states" in metrics:
                metrics["cost_states"].update(
                    final_alternative="NOT_MEASURED",
                    final_optimal="NOT_MEASURED",
                    final_original_path="NOT_MEASURED",
                )
            if result.iteration_metrics:
                last = result.iteration_metrics[-1]
                last.setdefault("solver_status", result.solver_status)
                last["solver_attempted"] = bool(solver.statistics.get("solver_called"))
                last["candidate_available"] = last_candidate is not None
                last["stop_reason"] = metrics["stop_reason"]
                if "before" in locals():
                    for key, value in self.budget.timings.items():
                        last[key] = value - before[key]
            if not result.explanation_text:
                result.explanation_text = generate_explanation_text(
                    last_candidate,
                    full_grid,
                    stop_reason=metrics["stop_reason"],
                    solver_status="PATH_VALIDATED" if result.success else "CANDIDATE_UNVALIDATED",
                )
                if not metrics["cardinality_certified"]:
                    result.explanation_text += (
                        " Minimum intervention cardinality is not certified."
                    )
            if result.graph_nodes is not None:
                metrics["node_reduction_ratio"] = (
                    1 - result.graph_nodes / metrics["full_graph_nodes"]
                )
                metrics["edge_reduction_ratio"] = (
                    1 - result.graph_edges / metrics["full_graph_edges"]
                    if metrics.get("full_graph_edges")
                    else None
                )
            metrics["cuts"] = solver.statistics.get("cuts") if self.incremental else 0
        return result


def solve_closed_loop(
    full_grid: Grid, start, goal, alternative_path, **kwargs
) -> ClosedLoopResult:
    return ClosedLoopISPSolver(**kwargs).solve(full_grid, start, goal, alternative_path)
