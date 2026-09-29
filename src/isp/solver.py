import cvxpy as cp
import numpy as np

from ..config import (
    V_MAX,
)
from ..grid import Grid
from ..planning import astar
from ..reduction import ReducedGraph, prepare_subgraph
from .base import BaseISPSolver
from .types import SemanticModifications


class ISPSolver(BaseISPSolver):
    def solve(
        self,
        grid: Grid,
        start: tuple[int, int],
        goal: tuple[int, int],
        alternative_path: list[tuple[int, int]],
        custom_edge_costs: dict[tuple[tuple[int, int], tuple[int, int]], float]
        | None = None,
        reduced_graph: ReducedGraph | None = None,
    ) -> tuple[bool, SemanticModifications | None, float]:
        if not alternative_path:
            return False, None, float("inf")

        if alternative_path[0] != start or alternative_path[-1] != goal:
            return False, None, float("inf")

        if start == goal and len(alternative_path) == 1:
            return True, SemanticModifications([], [], []), 0.0

        _p_star, cost_p_star, _ = astar(grid, start, goal)
        if cost_p_star != float("inf"):
            t_min_prime = sum(
                grid.get_distance(alternative_path[r], alternative_path[r + 1]) / V_MAX
                for r in range(len(alternative_path) - 1)
            )
            if t_min_prime > cost_p_star:
                return False, None, float("inf")

        active_nodes, active_edges, costs = prepare_subgraph(
            grid, alternative_path, reduced_graph, custom_edge_costs
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

        num_nodes = len(formulation.isp.nodes)
        num_edges = len(formulation.isp.edges)

        pi = cp.Variable(num_nodes)
        B_T = np.zeros((num_edges, num_nodes), dtype=np.float64)
        for k, (u, v) in enumerate(formulation.isp.edges):
            B_T[k, formulation.isp.node_to_idx[u]] = 1.0
            B_T[k, formulation.isp.node_to_idx[v]] = -1.0

        start_idx = formulation.isp.node_to_idx[start]
        goal_idx = formulation.isp.node_to_idx[goal]

        b_vec = np.zeros(num_nodes, dtype=np.float64)
        b_vec[start_idx] = 1.0
        b_vec[goal_idx] = -1.0

        constraints = [
            B_T @ pi <= formulation.w_prime,
            formulation.w_prime @ formulation.x_alt == b_vec @ pi,
            formulation.w_prime >= formulation.w_min,
            pi[goal_idx] == 0.0,
        ] + formulation.extra_constraints

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
