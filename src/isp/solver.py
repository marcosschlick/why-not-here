import cvxpy as cp
import numpy as np
from scipy.sparse import lil_matrix

from ..grid import Grid
from ..reduction import ReducedGraph, prepare_subgraph
from .base import BaseISPSolver
from .precheck import validate_alternative_path
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
        self.last_solver_status = None
        is_valid, status, _ = validate_alternative_path(
            grid, start, goal, alternative_path
        )
        if not is_valid:
            self.last_solver_status = status
            return False, None, float("inf")

        if start == goal and len(alternative_path) == 1:
            self.last_solver_status = "OPTIMAL"
            return True, SemanticModifications([], [], []), 0.0

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
            self.last_solver_status = "INVALID_ALTERNATIVE_PATH"
            return False, None, float("inf")

        num_nodes = len(formulation.isp.nodes)
        num_edges = len(formulation.isp.edges)

        pi = cp.Variable(num_nodes)
        A_T = lil_matrix((num_edges, num_nodes), dtype=np.float64)
        for k, (u, v) in enumerate(formulation.isp.edges):
            A_T[k, formulation.isp.node_to_idx[u]] = 1.0
            A_T[k, formulation.isp.node_to_idx[v]] = -1.0

        start_idx = formulation.isp.node_to_idx[start]
        goal_idx = formulation.isp.node_to_idx[goal]

        b_vec = np.zeros(num_nodes, dtype=np.float64)
        b_vec[start_idx] = 1.0
        b_vec[goal_idx] = -1.0

        constraints = [
            A_T.tocsr() @ pi <= formulation.w_prime,
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
