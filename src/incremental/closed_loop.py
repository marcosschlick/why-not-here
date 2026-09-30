import time

from src.config import (
    BBOX_MARGIN,
    CLOSED_LOOP_TIMEOUT_SEC,
    DEFAULT_REDUCTION_METHOD,
    DEFAULT_SOLVER,
    INCREMENTAL_ASTAR_SCOPE,
    INCREMENTAL_TOLERANCE,
    MAX_ISP_ITERATIONS,
    SOLVER_TIMEOUT_SEC,
)
from src.grid.grid import Grid
from src.isp.semantics import SemanticModifications
from src.planning.astar import astar
from src.reduction import create_reduced_graph, prepare_subgraph

from .explanation import (
    generate_cost_baseline_justification,
    generate_explanation_text,
)
from .precheck import check_geometric_feasibility, validate_alternative_path
from .result import ClosedLoopResult
from .step_solver import IncrementalISPSolver
from .validator import (
    ISPValidator,
    validate_global_optimality,
    validate_subgraph_optimality,
)


class ClosedLoopISPSolver:
    def __init__(
        self,
        solver_name: str = DEFAULT_SOLVER,
        timeout: float = SOLVER_TIMEOUT_SEC,
        global_timeout: float = CLOSED_LOOP_TIMEOUT_SEC,
        max_iterations: int = MAX_ISP_ITERATIONS,
        tolerance: float = INCREMENTAL_TOLERANCE,
        reduction_method: str = DEFAULT_REDUCTION_METHOD,
        bbox_margin: int = BBOX_MARGIN,
        astar_scope: str = INCREMENTAL_ASTAR_SCOPE,
    ) -> None:
        self.solver_name = solver_name
        self.timeout = timeout
        self.global_timeout = global_timeout
        self.max_iterations = max_iterations
        self.tolerance = tolerance
        self.reduction_method = reduction_method
        self.bbox_margin = bbox_margin
        self.astar_scope = astar_scope

    def solve(
        self,
        full_grid: Grid,
        start: tuple[int, int],
        goal: tuple[int, int],
        alternative_path: list[tuple[int, int]],
        reduction_method: str | None = None,
        astar_scope: str | None = None,
    ) -> ClosedLoopResult:
        method = (
            reduction_method if reduction_method is not None else self.reduction_method
        )
        scope = (
            astar_scope if astar_scope is not None else self.astar_scope
        ).strip().upper()
        if method == "NONE":
            scope = "GLOBAL"
        start_time = time.perf_counter()

        is_valid, status, msg = validate_alternative_path(
            full_grid, start, goal, alternative_path
        )
        if not is_valid:
            p_star, cost_p_star, _ = astar(full_grid, start, goal)
            return ClosedLoopResult(
                success=False,
                modifications=None,
                explanation_text=msg or "",
                iterations=0,
                competing_paths_count=0,
                original_optimal_path=p_star if p_star else [],
                original_optimal_cost=cost_p_star,
                final_alternative_cost=float("inf"),
                runtime_sec=time.perf_counter() - start_time,
                solver_status=status or "INVALID_ALTERNATIVE_PATH",
                reduction_method=method,
                cost_baseline_text="",
            )

        p_star, cost_p_star, _ = astar(full_grid, start, goal)
        cost_p_prime_init = ISPValidator.compute_path_cost(full_grid, alternative_path)
        baseline_text = generate_cost_baseline_justification(
            cost_p_star, cost_p_prime_init
        )

        def make_res(
            success: bool,
            modifications: SemanticModifications | None,
            explanation: str,
            iterations: int,
            competing_count: int,
            alt_cost: float,
            status: str,
        ) -> ClosedLoopResult:
            return ClosedLoopResult(
                success=success,
                modifications=modifications,
                explanation_text=explanation,
                iterations=iterations,
                competing_paths_count=competing_count,
                original_optimal_path=p_star if p_star else [],
                original_optimal_cost=cost_p_star,
                final_alternative_cost=alt_cost,
                runtime_sec=time.perf_counter() - start_time,
                solver_status=status,
                reduction_method=method,
                cost_baseline_text=baseline_text,
            )

        if start == goal and len(alternative_path) == 1:
            return make_res(
                True,
                SemanticModifications([], [], []),
                "Origin and destination coincide; no modifications required.",
                0,
                1,
                0.0,
                "OPTIMAL",
            )

        is_geom_ok, geom_status, geom_msg = check_geometric_feasibility(
            full_grid, alternative_path, cost_p_star, self.tolerance
        )
        if not is_geom_ok:
            return make_res(
                False,
                None,
                geom_msg or "",
                0,
                1,
                cost_p_prime_init,
                geom_status or "GEOMETRICALLY_INFEASIBLE",
            )

        Q: list[list[tuple[int, int]]] = [p_star] if p_star is not None else []

        step_solver = IncrementalISPSolver(
            solver_name=self.solver_name,
            timeout=self.timeout,
        )

        reduced_graph = create_reduced_graph(
            full_grid,
            p_star if p_star else alternative_path,
            alternative_path,
            method=method,
            margin=self.bbox_margin,
        )

        active_nodes, active_edges, custom_costs = prepare_subgraph(
            full_grid, alternative_path, reduced_graph, None
        )

        delta = None
        cost_p_prime = float("inf")

        for iteration in range(1, self.max_iterations + 1):
            elapsed = time.perf_counter() - start_time
            if elapsed >= self.global_timeout:
                return make_res(
                    False,
                    delta,
                    "Global execution time limit exceeded.",
                    iteration - 1,
                    len(Q),
                    cost_p_prime,
                    "TIMEOUT",
                )

            step_solver.timeout = max(0.1, min(self.timeout, self.global_timeout - elapsed))

            milp_ok, delta, _ = step_solver.solve_step(
                full_grid,
                start,
                goal,
                alternative_path,
                Q,
                reduced_graph=reduced_graph,
            )

            if (
                time.perf_counter() - start_time >= self.global_timeout
                and not milp_ok
                and step_solver.last_solver_status != "OPTIMAL_INACCURATE"
            ):
                return make_res(
                    False,
                    delta,
                    "Global execution time limit exceeded.",
                    iteration,
                    len(Q),
                    cost_p_prime,
                    "TIMEOUT",
                )

            if not milp_ok or delta is None:
                solver_status = step_solver.last_solver_status or "SOLVER_FAILED"
                explanation = (
                    "The MILP solver did not find a feasible intervention."
                    if solver_status == "INFEASIBLE"
                    else (
                        "The MILP solver returned OPTIMAL_INACCURATE; the run is "
                        "inconclusive and does not certify minimum intervention cardinality."
                        if solver_status == "OPTIMAL_INACCURATE"
                        else "The MILP solver did not return a usable solution."
                    )
                )
                return make_res(
                    False,
                    None,
                    explanation,
                    iteration,
                    len(Q),
                    cost_p_prime_init,
                    solver_status,
                )

            if (
                scope == "SUBGRAPH"
                and active_nodes is not None
                and active_edges is not None
            ):
                is_opt, q_viol, cost_p_prime, _ = validate_subgraph_optimality(
                    full_grid,
                    start,
                    goal,
                    alternative_path,
                    delta,
                    active_nodes=active_nodes,
                    active_edges=active_edges,
                    custom_edge_costs=custom_costs,
                    tolerance=self.tolerance,
                )
            else:
                is_opt, q_viol, cost_p_prime, _ = validate_global_optimality(
                    full_grid,
                    start,
                    goal,
                    alternative_path,
                    delta,
                    tolerance=self.tolerance,
                )

            if is_opt:
                if scope == "SUBGRAPH":
                    is_globally_opt, _, p_cost_glob, _ = (
                        validate_global_optimality(
                            full_grid,
                            start,
                            goal,
                            alternative_path,
                            delta,
                            tolerance=self.tolerance,
                        )
                    )
                    if is_globally_opt:
                        explanation = generate_explanation_text(
                            delta, full_grid
                        )
                        return make_res(
                            True,
                            delta,
                            explanation,
                            iteration,
                            len(Q),
                            p_cost_glob,
                            step_solver.last_solver_status or "OPTIMAL",
                        )
                    else:
                        explanation = (
                            "The alternative path p' could not be made optimal by the planner "
                            "within the allowed intervention domain."
                        )
                        return make_res(
                            False,
                            delta,
                            explanation,
                            iteration,
                            len(Q),
                            p_cost_glob,
                            "SUBGRAPH_OPTIMAL_ONLY",
                        )
                else:
                    explanation = generate_explanation_text(delta, full_grid)
                    return make_res(
                        True,
                        delta,
                        explanation,
                        iteration,
                        len(Q),
                        cost_p_prime,
                        step_solver.last_solver_status or "OPTIMAL",
                    )

            if q_viol is None:
                return make_res(
                    False,
                    delta,
                    "No valid path connects origin to destination under current modifications.",
                    iteration,
                    len(Q),
                    cost_p_prime,
                    "DISCONNECTED_GRAPH",
                )

            if q_viol in Q:
                return make_res(
                    False,
                    delta,
                    "Convergence stalled due to repeated competing path.",
                    iteration,
                    len(Q),
                    cost_p_prime,
                    "STALLED_OR_CYCLE",
                )

            Q.append(q_viol)

        return make_res(
            False,
            delta,
            "Maximum iterations reached without global optimality certification.",
            self.max_iterations,
            len(Q),
            cost_p_prime,
            "MAX_ITERATIONS_EXCEEDED",
        )


def solve_closed_loop(
    full_grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    alternative_path: list[tuple[int, int]],
    reduction_method: str = DEFAULT_REDUCTION_METHOD,
    bbox_margin: int = BBOX_MARGIN,
    solver_name: str = DEFAULT_SOLVER,
    timeout: float = SOLVER_TIMEOUT_SEC,
    global_timeout: float = CLOSED_LOOP_TIMEOUT_SEC,
    max_iterations: int = MAX_ISP_ITERATIONS,
    tolerance: float = INCREMENTAL_TOLERANCE,
    astar_scope: str = INCREMENTAL_ASTAR_SCOPE,
) -> ClosedLoopResult:
    solver = ClosedLoopISPSolver(
        solver_name=solver_name,
        timeout=timeout,
        global_timeout=global_timeout,
        max_iterations=max_iterations,
        tolerance=tolerance,
        reduction_method=reduction_method,
        bbox_margin=bbox_margin,
        astar_scope=astar_scope,
    )
    return solver.solve(
        full_grid,
        start,
        goal,
        alternative_path,
        reduction_method=reduction_method,
        astar_scope=astar_scope,
    )
