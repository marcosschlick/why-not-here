import cvxpy as cp
import numpy as np

from ..config import (
    DEFAULT_SOLVER,
    INCREMENTAL_TOLERANCE,
    MIP_GAP_TOLERANCE,
    SOLVER_TIMEOUT_SEC,
)
from ..grid import Grid
from .formulation import build_base_formulation
from .types import MIPFormulation, SemanticModifications


class BaseISPSolver:
    def __init__(
        self,
        solver_name: str = DEFAULT_SOLVER,
        timeout: float = SOLVER_TIMEOUT_SEC,
        mip_gap: float = MIP_GAP_TOLERANCE,
        tolerance: float = INCREMENTAL_TOLERANCE,
    ) -> None:
        self.solver_name = solver_name
        self.timeout = timeout
        self.mip_gap = mip_gap
        self.tolerance = tolerance
        self.last_solver_status: str | None = None

    def _select_solver(self) -> str | None:
        if self.solver_name in cp.installed_solvers():
            return self.solver_name
        return None

    def _build_formulation(
        self,
        grid: Grid,
        alternative_path: list[tuple[int, int]],
        active_nodes: set[tuple[int, int]] | None = None,
        active_edges: set[tuple[tuple[int, int], tuple[int, int]]] | None = None,
        custom_edge_costs: dict[tuple[tuple[int, int], tuple[int, int]], float]
        | None = None,
    ) -> MIPFormulation | None:
        return build_base_formulation(
            grid=grid,
            alternative_path=alternative_path,
            active_nodes=active_nodes,
            active_edges=active_edges,
            custom_edge_costs=custom_edge_costs,
        )

    def _solve_milp(self, problem: cp.Problem) -> tuple[bool, float]:
        solver = self._select_solver()

        if solver is None:
            self.last_solver_status = "SOLVER_NOT_FOUND"
            return False, float("inf")

        solver_kwargs = {}
        if solver == "GUROBI":
            solver_kwargs = {"TimeLimit": self.timeout, "MIPGap": self.mip_gap}
        elif solver == "HIGHS":
            solver_kwargs = {"time_limit": self.timeout, "mip_rel_gap": self.mip_gap}

        try:
            problem.solve(solver=solver, **solver_kwargs)
        except (cp.SolverError, ValueError, TypeError, RuntimeError):
            self.last_solver_status = "SOLVER_ERROR"
            return False, float("inf")

        if problem.status == cp.OPTIMAL and problem.value is not None:
            self.last_solver_status = "OPTIMAL"
            return True, float(problem.value)

        if problem.status == cp.OPTIMAL_INACCURATE:
            self.last_solver_status = "OPTIMAL_INACCURATE"
            return False, float("inf")

        if problem.status == cp.INFEASIBLE:
            self.last_solver_status = "INFEASIBLE"
        elif problem.status == cp.USER_LIMIT:
            self.last_solver_status = "TIMEOUT"
        else:
            self.last_solver_status = "SOLVER_FAILED"
        return False, float("inf")

    def _extract_modifications(
        self,
        formulation: MIPFormulation,
    ) -> SemanticModifications:
        isp = formulation.isp
        z_val = np.zeros(isp.total_z_vars, dtype=np.float64)
        if (
            formulation.z_terrain is not None
            and formulation.z_terrain.value is not None
        ):
            z_val[: isp.num_terrain_vars] = np.clip(
                formulation.z_terrain.value, 0.0, 1.0
            )

        if (
            formulation.z_obstacle is not None
            and formulation.z_obstacle.value is not None
        ):
            z_val[
                isp.num_terrain_vars : isp.num_terrain_vars + isp.num_obstacle_vars
            ] = np.clip(formulation.z_obstacle.value, 0.0, 1.0)

        if formulation.z_slope is not None and formulation.z_slope.value is not None:
            slope_start = isp.num_terrain_vars + isp.num_obstacle_vars
            slope_end = slope_start + isp.num_slope_vars
            z_val[slope_start:slope_end] = np.clip(formulation.z_slope.value, 0.0, 1.0)

        if formulation.z_water is not None and formulation.z_water.value is not None:
            water_start = (
                isp.num_terrain_vars + isp.num_obstacle_vars + isp.num_slope_vars
            )
            z_val[water_start:] = np.clip(formulation.z_water.value, 0.0, 1.0)

        return isp.get_modifications(z_val)
