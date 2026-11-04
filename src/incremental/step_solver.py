import time

import cvxpy as cp
import numpy as np

from ..config import (
    BASE_TERRAIN,
    DEFAULT_SOLVER,
    IMPASSABLE_TERRAINS,
    MIP_GAP_TOLERANCE,
    SOLVER_TIMEOUT_SEC,
    WATER_TERRAIN,
)
from ..grid import Grid
from ..isp.base import BaseISPSolver
from ..isp.precheck import validate_alternative_path
from ..isp.semantics import SemanticModifications
from ..isp.types import MIPFormulation
from ..reduction import ReducedGraph, prepare_subgraph


def external_edge_cost(
    grid: Grid,
    formulation: MIPFormulation,
    edge: tuple[tuple[int, int], tuple[int, int]],
) -> cp.Expression | float | None:
    u, v = edge
    isp = formulation.isp
    if abs(grid.get_slope(u, v)) > grid.max_slope_deg:
        return None
    for node in edge:
        cell = grid.get_cell(node)
        if cell.obstacle and node not in isp.obstacle_to_idx:
            return None
        if cell.terrain in IMPASSABLE_TERRAINS:
            water_open = cell.terrain == WATER_TERRAIN and (
                node in grid.water_overrides or node in isp.water_to_idx
            )
            if not water_open:
                return None

    distance = grid.get_distance(u, v)
    if edge in grid.robot_speed_edges:
        return distance / grid.robot_speed_theoretical

    factor = distance * (1.0 + grid.get_slope_penalty(u, v)) / 2.0
    cost: cp.Expression | float = 0.0
    for node in edge:
        speed = grid.speeds.get(grid.get_cell(node).terrain, 0.0)
        speed = speed if speed > 0.0 else grid.speeds[BASE_TERRAIN]
        cost += factor / speed
        if node in isp.terrain_to_idx and formulation.z_terrain is not None:
            start = isp.terrain_to_idx[node] * len(isp.terrain_classes)
            for j, terrain in enumerate(isp.terrain_classes):
                delta = factor * (1.0 / grid.speeds[terrain] - 1.0 / speed)
                cost += delta * formulation.z_terrain[start + j]
    return cost


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
        self.last_graph_nodes = None
        self.last_graph_edges = None
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
        active_nodes, active_edges, costs = prepare_subgraph(
            grid,
            alternative_path,
            reduced_graph,
            None,
        )
        self.last_preparation_sec = time.perf_counter() - preparation_started

        model_started = time.perf_counter()
        formulation = self._build_formulation(
            grid,
            alternative_path,
            active_nodes=active_nodes,
            active_edges=active_edges,
            custom_edge_costs=costs,
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
            c_ext: cp.Expression | float = 0.0
            valid_q = True
            for r in range(len(q) - 1):
                edge = (q[r], q[r + 1])
                if edge in formulation.isp.edge_to_idx:
                    x_q[formulation.isp.edge_to_idx[edge]] += 1.0
                else:
                    if costs and edge in costs:
                        c_ext += costs[edge]
                    elif (
                        reduced_graph is not None
                        and reduced_graph.method_name in {"FLOODFILL", "PATH_ONLY"}
                    ):
                        edge_cost = external_edge_cost(grid, formulation, edge)
                        if edge_cost is None:
                            valid_q = False
                            break
                        c_ext += edge_cost
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
