from itertools import pairwise

import cvxpy as cp
import numpy as np

from ..grid import Grid
from ..isp.base import BaseISPSolver
from ..reduction import ReducedGraph, prepare_subgraph


class IncrementalISPSolver(BaseISPSolver):
    def solve_step(
        self,
        grid: Grid,
        start: tuple[int, int],
        goal: tuple[int, int],
        alternative_path: list[tuple[int, int]],
        competing_paths: list[list[tuple[int, int]]],
        reduced_graph: ReducedGraph | None = None,
    ):
        self.statistics = {}
        self.last_solver_status = None
        self.budget.check()
        with self.budget.phase("preparation_sec"):
            decision_nodes = set(alternative_path)
            if grid.isp_model == "BRANDAO":
                decision_nodes.update(node for path in competing_paths for node in path)
            nodes, edges, costs = prepare_subgraph(
                grid, alternative_path, reduced_graph
            )
            physical_edges = {
                edge for path in competing_paths for edge in pairwise(path)
            }
            if edges is not None:
                edges = edges | physical_edges
                nodes = nodes | {node for edge in physical_edges for node in edge}
                costs = {
                    edge: cost
                    for edge, cost in (costs or {}).items()
                    if edge not in physical_edges
                }
        with self.budget.phase("model_build_sec"):
            formulation = self._build_formulation(
                grid,
                alternative_path,
                active_nodes=nodes,
                active_edges=edges,
                custom_edge_costs=costs,
                terrain_decision_nodes=decision_nodes,
            )
            if formulation is None:
                self.last_solver_status = "INVALID_ALTERNATIVE_PATH"
                return False, None, float("inf")
            constraints = [
                formulation.w_prime >= formulation.w_min
            ] + formulation.extra_constraints
            cuts = 0
            for path in competing_paths:
                self.budget.check()
                incidence = np.zeros(len(formulation.isp.edges))
                for edge in pairwise(path):
                    if edge not in formulation.isp.edge_to_idx:
                        self.last_solver_status = "INCONSISTENT_COMPETING_PATH"
                        return False, None, float("inf")
                    incidence[formulation.isp.edge_to_idx[edge]] += 1
                constraints.append(
                    formulation.w_prime @ formulation.x_alt
                    <= formulation.w_prime @ incidence + self.tolerance
                )
                cuts += 1
            objective = (
                cp.sum(formulation.obj_terms)
                if formulation.obj_terms
                else cp.Constant(0.0)
            )
            problem = cp.Problem(cp.Minimize(objective), constraints)
        usable, objective = self._solve_milp(problem)
        self.statistics["cuts"] = cuts
        return (
            usable,
            self._extract_modifications(formulation) if usable else None,
            objective,
        )
