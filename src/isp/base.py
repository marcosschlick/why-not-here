import cvxpy as cp
import numpy as np

from ..config import (
    DEFAULT_SOLVER,
    EPSILON_L1,
    MIP_GAP_TOLERANCE,
    RHO_OBSTACLE,
    RHO_SLOPE,
    RHO_TERRAIN,
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
        rho_terrain: float = RHO_TERRAIN,
        rho_obstacle: float = RHO_OBSTACLE,
        rho_slope: float = RHO_SLOPE,
        epsilon_l1: float = EPSILON_L1,
    ) -> None:
        self.solver_name = solver_name
        self.timeout = timeout
        self.mip_gap = mip_gap
        self.rho_terrain = rho_terrain
        self.rho_obstacle = rho_obstacle
        self.rho_slope = rho_slope
        self.epsilon_l1 = epsilon_l1
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
            rho_terrain=self.rho_terrain,
            rho_obstacle=self.rho_obstacle,
            rho_slope=self.rho_slope,
            epsilon_l1=self.epsilon_l1,
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
            self.last_solver_status = str(problem.status)
        except (cp.SolverError, ValueError, TypeError, RuntimeError) as e:
            self.last_solver_status = f"SOLVER_ERROR: {e}"
            return False, float("inf")

        if (
            problem.status not in (cp.OPTIMAL, cp.OPTIMAL_INACCURATE)
            or problem.value is None
        ):
            return False, float("inf")

        return True, float(problem.value)

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
            z_val[isp.num_terrain_vars + isp.num_obstacle_vars :] = np.clip(
                formulation.z_slope.value, 0.0, 1.0
            )

        return isp.get_modifications(z_val)
