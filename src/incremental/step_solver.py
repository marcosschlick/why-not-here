import cvxpy as cp
import numpy as np

from ..config import (
    DEFAULT_SOLVER,
    EPSILON_L1,
    INCREMENTAL_TOLERANCE,
    MIP_GAP_TOLERANCE,
    RHO_OBSTACLE,
    RHO_SLOPE,
    RHO_TERRAIN,
    SOLVER_TIMEOUT_SEC,
)
from ..grid import Grid
from ..isp.base import BaseISPSolver
from ..isp.semantics import SemanticModifications
from ..reduction import ReducedGraph, prepare_subgraph


class IncrementalISPSolver(BaseISPSolver):
    def __init__(
        self,
        solver_name: str = DEFAULT_SOLVER,
        timeout: float = SOLVER_TIMEOUT_SEC,
        mip_gap: float = MIP_GAP_TOLERANCE,
        rho_terrain: float = RHO_TERRAIN,
        rho_obstacle: float = RHO_OBSTACLE,
        rho_slope: float = RHO_SLOPE,
        epsilon_l1: float = EPSILON_L1,
        tolerance: float = INCREMENTAL_TOLERANCE,
    ) -> None:
        super().__init__(
            solver_name=solver_name,
            timeout=timeout,
            mip_gap=mip_gap,
            rho_terrain=rho_terrain,
            rho_obstacle=rho_obstacle,
            rho_slope=rho_slope,
            epsilon_l1=epsilon_l1,
        )
        self.tolerance = tolerance

    def solve_step(
        self,
        grid: Grid,
        start: tuple[int, int],
        goal: tuple[int, int],
        alternative_path: list[tuple[int, int]],
        competing_paths: list[list[tuple[int, int]]],
        reduced_graph: ReducedGraph | None = None,
    ) -> tuple[bool, SemanticModifications | None, float]:
        if not alternative_path:
            return False, None, float("inf")

        if alternative_path[0] != start or alternative_path[-1] != goal:
            return False, None, float("inf")

        if start == goal and len(alternative_path) == 1:
            return True, SemanticModifications([], [], []), 0.0

        active_nodes, active_edges, costs = prepare_subgraph(
            grid, alternative_path, reduced_graph, None
        )

        formulation = self._build_formulation(
            grid,
            alternative_path,
            active_nodes=active_nodes,
            active_edges=active_edges,
            custom_edge_costs=costs,
        )
        if formulation is None:
            return False, None, float("inf")

        constraints = [
            formulation.w_prime >= formulation.w_min,
        ] + formulation.extra_constraints
        for q in competing_paths:
            if len(q) < 2:
                continue
            x_q = np.zeros(len(formulation.isp.edges), dtype=np.float64)
            c_ext = 0.0
            valid_q = True
            for r in range(len(q) - 1):
                edge = (q[r], q[r + 1])
                if edge in formulation.isp.edge_to_idx:
                    x_q[formulation.isp.edge_to_idx[edge]] += 1.0
                else:
                    if costs and edge in costs:
                        c_ext += costs[edge]
                    else:
                        edge_cost = grid.get_cost(edge[0], edge[1])
                        if edge_cost == float("inf"):
                            valid_q = False
                            break
                        c_ext += edge_cost
            if valid_q:
                constraints.append(
                    formulation.w_prime @ formulation.x_alt
                    <= formulation.w_prime @ x_q + c_ext
                )

        obj_expr = (
            cp.sum(formulation.obj_terms)
            if formulation.obj_terms
            else cp.Constant(0.0)
        )
        problem = cp.Problem(cp.Minimize(obj_expr), constraints)
        success, cost = self._solve_milp(problem)
        if not success:
            return False, None, float("inf")

        modifications = self._extract_modifications(formulation)
        return True, modifications, cost
