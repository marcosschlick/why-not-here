import time

import cvxpy as cp
import numpy as np

from ..config import (
    DEFAULT_SOLVER,
    MIP_GAP_TOLERANCE,
    SOLVER_TIMEOUT_SEC,
)
from ..grid import Grid
from ..isp.base import BaseISPSolver
from ..isp.precheck import validate_alternative_path
from ..isp.semantics import SemanticModifications
from ..reduction import ReducedGraph, prepare_subgraph


class IncrementalISPSolver(BaseISPSolver):
    def __init__(
        self,
        solver_name: str = DEFAULT_SOLVER,
        timeout: float = SOLVER_TIMEOUT_SEC,
        mip_gap: float = MIP_GAP_TOLERANCE,
    ) -> None:
        super().__init__(
            solver_name=solver_name,
            timeout=timeout,
            mip_gap=mip_gap,
        )
        self.last_preparation_sec = 0.0
        self.last_model_build_sec = 0.0
        self.last_solver_runtime_sec = 0.0

    def solve_step(
        self,
        grid: Grid,
        start: tuple[int, int],
        goal: tuple[int, int],
        alternative_path: list[tuple[int, int]],
        competing_paths: list[list[tuple[int, int]]],
        reduced_graph: ReducedGraph | None = None,
        terrain_only: bool = False,
    ) -> tuple[bool, SemanticModifications | None, float]:
        self.last_preparation_sec = 0.0
        self.last_model_build_sec = 0.0
        self.last_solver_runtime_sec = 0.0
        self.last_solver_status = None
        preparation_started = time.perf_counter()
        is_valid, status, _ = validate_alternative_path(
            grid, start, goal, alternative_path
        )
        if not is_valid:
            self.last_preparation_sec = time.perf_counter() - preparation_started
            self.last_solver_status = status
            return False, None, float("inf")

        if start == goal and len(alternative_path) == 1:
            self.last_solver_status = "OPTIMAL"
            self.last_preparation_sec = time.perf_counter() - preparation_started
            return True, SemanticModifications([], [], []), 0.0

        if reduced_graph is not None:
            competing_paths = [
                reduced_graph.expand_path(path) for path in competing_paths
            ]
        terrain_decision_nodes = set(alternative_path)
        terrain_decision_nodes.update(node for path in competing_paths for node in path)
        active_nodes, active_edges, costs = prepare_subgraph(
            grid,
            alternative_path,
            reduced_graph,
            None,
            terrain_decision_nodes=terrain_decision_nodes,
        )
        self.last_preparation_sec = time.perf_counter() - preparation_started

        model_started = time.perf_counter()
        formulation = self._build_formulation(
            grid,
            alternative_path,
            active_nodes=active_nodes,
            active_edges=active_edges,
            custom_edge_costs=costs,
            terrain_decision_nodes=terrain_decision_nodes,
            terrain_only=terrain_only,
        )
        if formulation is None:
            self.last_model_build_sec = time.perf_counter() - model_started
            self.last_solver_status = "INVALID_ALTERNATIVE_PATH"
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
        self.last_model_build_sec = time.perf_counter() - model_started
        success, cost = self._solve_milp(problem)
        if not success:
            return False, None, float("inf")

        modifications = self._extract_modifications(formulation)
        return True, modifications, cost
