import time

from src.config import (
    BBOX_MARGIN,
    CLOSED_LOOP_TIMEOUT_SEC,
    DEFAULT_REDUCTION_METHOD,
    DEFAULT_SOLVER,
    EPSILON_L1,
    INCREMENTAL_TOLERANCE,
    MAX_ISP_ITERATIONS,
    RHO_OBSTACLE,
    RHO_SLOPE,
    RHO_TERRAIN,
    SOLVER_TIMEOUT_SEC,
)
from src.grid.grid import Grid
from src.isp.semantics import SemanticModifications
from src.planning.astar import astar
from src.reduction import create_reduced_graph

from .explanation import (
    generate_cost_baseline_justification,
    generate_explanation_text,
)
from .precheck import check_geometric_feasibility, validate_alternative_path
from .result import ClosedLoopResult
from .step_solver import IncrementalISPSolver
from .validator import ISPValidator, validate_global_optimality


class ClosedLoopISPSolver:
    def __init__(
        self,
        solver_name: str = DEFAULT_SOLVER,
        timeout: float = SOLVER_TIMEOUT_SEC,
        global_timeout: float = CLOSED_LOOP_TIMEOUT_SEC,
        max_iterations: int = MAX_ISP_ITERATIONS,
        tolerance: float = INCREMENTAL_TOLERANCE,
        rho_terrain: float = RHO_TERRAIN,
        rho_obstacle: float = RHO_OBSTACLE,
        rho_slope: float = RHO_SLOPE,
        epsilon_l1: float = EPSILON_L1,
        reduction_method: str = DEFAULT_REDUCTION_METHOD,
        bbox_margin: int = BBOX_MARGIN,
    ) -> None:
        self.solver_name = solver_name
        self.timeout = timeout
        self.global_timeout = global_timeout
        self.max_iterations = max_iterations
        self.tolerance = tolerance
        self.rho_terrain = rho_terrain
        self.rho_obstacle = rho_obstacle
        self.rho_slope = rho_slope
        self.epsilon_l1 = epsilon_l1
        self.reduction_method = reduction_method
        self.bbox_margin = bbox_margin

    def solve(
        self,
        full_grid: Grid,
        start: tuple[int, int],
        goal: tuple[int, int],
        alternative_path: list[tuple[int, int]],
        reduction_method: str | None = None,
    ) -> ClosedLoopResult:
        method = (
            reduction_method if reduction_method is not None else self.reduction_method
        )
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
                "Origem e destino coincidem; nenhuma alteração necessária.",
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
            rho_terrain=self.rho_terrain,
            rho_obstacle=self.rho_obstacle,
            rho_slope=self.rho_slope,
            epsilon_l1=self.epsilon_l1,
            tolerance=self.tolerance,
        )

        reduced_graph = create_reduced_graph(
            full_grid,
            p_star if p_star else alternative_path,
            alternative_path,
            method=method,
            margin=self.bbox_margin,
        )

        delta = None
        cost_p_prime = float("inf")

        for iteration in range(1, self.max_iterations + 1):
            elapsed = time.perf_counter() - start_time
            if elapsed >= self.global_timeout:
                return make_res(
                    False,
                    delta,
                    "Tempo limite global de execução excedido.",
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

            if time.perf_counter() - start_time >= self.global_timeout and not milp_ok:
                return make_res(
                    False,
                    delta,
                    "Tempo limite global de execução excedido.",
                    iteration,
                    len(Q),
                    cost_p_prime,
                    "TIMEOUT",
                )

            if not milp_ok or delta is None:
                return make_res(
                    False,
                    None,
                    "Nenhuma intervenção viável encontrada pelo solver MILP.",
                    iteration,
                    len(Q),
                    cost_p_prime_init,
                    "INFEASIBLE_OR_FAILED",
                )

            is_opt, q_viol, cost_p_prime, _ = validate_global_optimality(
                full_grid,
                start,
                goal,
                alternative_path,
                delta,
                tolerance=self.tolerance,
            )

            if is_opt:
                explanation = generate_explanation_text(delta, full_grid)
                return make_res(
                    True,
                    delta,
                    explanation,
                    iteration,
                    len(Q),
                    cost_p_prime,
                    "OPTIMAL",
                )

            if q_viol is None:
                return make_res(
                    False,
                    delta,
                    "Não existe caminho conectando a origem ao destino sob as modificações atuais.",
                    iteration,
                    len(Q),
                    cost_p_prime,
                    "DISCONNECTED_GRAPH",
                )

            if q_viol in Q:
                return make_res(
                    False,
                    delta,
                    "Convergência estagnada por repetição de caminho competidor.",
                    iteration,
                    len(Q),
                    cost_p_prime,
                    "STALLED_OR_CYCLE",
                )

            Q.append(q_viol)

        return make_res(
            False,
            delta,
            "Limite máximo de iterações atingido sem certificação de otimalidade global.",
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
    rho_terrain: float = RHO_TERRAIN,
    rho_obstacle: float = RHO_OBSTACLE,
    rho_slope: float = RHO_SLOPE,
    epsilon_l1: float = EPSILON_L1,
) -> ClosedLoopResult:
    solver = ClosedLoopISPSolver(
        solver_name=solver_name,
        timeout=timeout,
        global_timeout=global_timeout,
        max_iterations=max_iterations,
        tolerance=tolerance,
        rho_terrain=rho_terrain,
        rho_obstacle=rho_obstacle,
        rho_slope=rho_slope,
        epsilon_l1=epsilon_l1,
        reduction_method=reduction_method,
        bbox_margin=bbox_margin,
    )
    return solver.solve(
        full_grid, start, goal, alternative_path, reduction_method=reduction_method
    )
