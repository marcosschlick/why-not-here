import time

import cvxpy as cp
import numpy as np

from ..config import (
    DEFAULT_SOLVER,
    INCREMENTAL_TOLERANCE,
    ISP_TIME_BUDGET_SEC,
    MIP_GAP_TOLERANCE,
)
from ..grid import Grid
from .budget import ScenarioBudget, current_budget
from .formulation import build_base_formulation
from .types import MIPFormulation, SemanticModifications


class BaseISPSolver:
    def __init__(
        self,
        solver_name: str = DEFAULT_SOLVER,
        budget: ScenarioBudget | None = None,
        mip_gap: float = MIP_GAP_TOLERANCE,
        tolerance: float = INCREMENTAL_TOLERANCE,
    ) -> None:
        self.solver_name = solver_name
        self.budget = budget or current_budget() or ScenarioBudget(ISP_TIME_BUDGET_SEC)
        self.statistics: dict = {}
        self.last_solver_runtime_sec = 0.0
        self.last_formulation: MIPFormulation | None = None
        self.mip_gap = mip_gap
        self.tolerance = tolerance
        self.last_solver_status: str | None = None
        self.last_graph_nodes: int | None = None
        self.last_graph_edges: int | None = None

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
        terrain_decision_nodes: set[tuple[int, int]] | None = None,
    ) -> MIPFormulation | None:
        self.last_graph_nodes = None
        self.last_graph_edges = None
        formulation = build_base_formulation(
            grid=grid,
            alternative_path=alternative_path,
            active_nodes=active_nodes,
            active_edges=active_edges,
            custom_edge_costs=custom_edge_costs,
            terrain_decision_nodes=terrain_decision_nodes,
        )
        self.last_formulation = formulation
        if formulation is not None:
            self.last_graph_nodes = len(formulation.isp.nodes)
            self.last_graph_edges = len(formulation.isp.edges)
        return formulation

    def _solve_milp(self, problem: cp.Problem) -> tuple[bool, float]:
        self.statistics = {
            "requested_mip_gap": self.mip_gap,
            "primal_feasibility_tolerance": 1e-5,
            "cardinality_bound_margin": 1e-6,
            "edge_cost_check_tolerance_sec": 1e-5,
        }
        solver = self._select_solver()
        if solver is None:
            self.last_solver_status = "SOLVER_NOT_FOUND"
            return False, float("inf")
        self.budget.check()
        metrics = problem.size_metrics
        self.statistics.update(
            variables=metrics.num_scalar_variables,
            constraints=metrics.num_scalar_eq_constr + metrics.num_scalar_leq_constr,
            integer_variables=sum(
                v.size
                for v in problem.variables()
                if v.attributes["boolean"] or v.attributes["integer"]
            ),
        )
        try:
            with self.budget.phase("model_build_sec"):
                data, chain, inverse = problem.get_problem_data(solver=solver)
                if "c" in data and "A" in data and data["A"] is not None:
                    self.statistics.update(
                        canonical_variables=int(data["c"].size),
                        canonical_constraints=int(data["A"].shape[0]),
                    )
            self.budget.check()
            remaining = self.budget.remaining_sec
            options = (
                {"TimeLimit": remaining, "MIPGap": self.mip_gap}
                if solver == "GUROBI"
                else {"time_limit": remaining, "mip_rel_gap": self.mip_gap}
            )
            self.statistics["solver_time_limit_sec"] = remaining
            started = time.perf_counter_ns()
            with self.budget.phase("solver_sec"):
                self.statistics["solver_called"] = True
                raw = chain.solve_via_data(
                    problem, data, warm_start=False, verbose=False, solver_opts=options
                )
                try:
                    self._read_native_statistics(raw, inverse)
                except (AttributeError, TypeError, ValueError, OverflowError) as exc:
                    self.statistics["statistics_warning"] = str(exc)
                    self.statistics["native_bound_source_valid"] = False
                recovery = raw
                if raw.get("model_status") == "kInterrupt" and getattr(
                    raw.get("solution"), "value_valid", False
                ):
                    recovery = {**raw, "model_status": "kTimeLimit"}
                    self.statistics["interrupted_primal_recovered"] = True
                problem.unpack_results(recovery, chain, inverse)
            self.last_solver_runtime_sec = (time.perf_counter_ns() - started) / 1e9
        except (cp.SolverError, ValueError, TypeError, RuntimeError) as exc:
            from .budget import ScenarioDeadlineExceeded

            if isinstance(exc, ScenarioDeadlineExceeded):
                raise
            native_stop = self.statistics.get("termination")
            self.last_solver_status = (
                native_stop
                if native_stop
                in {"TIME_LIMIT", "INTERRUPTED", "SOLVER_LIMIT", "INFEASIBLE"}
                else "SOLVER_ERROR"
            )
            self.statistics["error"] = str(exc)
            return False, float("inf")
        self.last_solver_status = self.statistics.get("termination") or {
            cp.OPTIMAL: "OPTIMAL",
            cp.OPTIMAL_INACCURATE: "OPTIMAL_INACCURATE",
            cp.INFEASIBLE: "INFEASIBLE",
            cp.USER_LIMIT: "SOLVER_LIMIT",
        }.get(problem.status, "SOLVER_FAILED")
        if problem.value is None or not np.isfinite(problem.value):
            return False, float("inf")
        self.statistics["objective"] = float(problem.value)
        usable = self.last_solver_status in {
            "OPTIMAL",
            "OPTIMAL_INACCURATE",
            "TIME_LIMIT",
            "INTERRUPTED",
            "SOLVER_LIMIT",
        }
        native_primal = self.statistics.get("native_primal_available")
        if native_primal is False or (
            native_primal is None
            and self.last_solver_status in {"TIME_LIMIT", "INTERRUPTED", "SOLVER_LIMIT"}
        ):
            usable = False
        bound = self.statistics.get("lower_bound")
        upper = float(problem.value)
        self.statistics["effective_gap"] = None
        if bound is not None and bound <= upper:
            self.statistics["absolute_gap"] = upper - bound
            self.statistics["effective_gap"] = (
                (upper - bound) / abs(upper)
                if upper != 0
                else 0.0
                if bound == 0
                else None
            )
        if usable:
            for variable in problem.variables():
                value = variable.value
                if value is None or not np.all(np.isfinite(value)):
                    usable = False
                    break
                if (
                    variable.attributes["boolean"] or variable.attributes["integer"]
                ) and np.max(np.abs(value - np.rint(value))) > 1e-5:
                    usable = False
                    break
            if usable:
                usable = all(
                    np.max(constraint.violation(), initial=0.0) <= 1e-5
                    for constraint in problem.constraints
                )
        self.statistics["candidate_consistent"] = bool(usable)
        self.statistics["bound_usable"] = bool(
            usable
            and problem.status != cp.OPTIMAL_INACCURATE
            and self.statistics.get("native_bound_source_valid", False)
            and self.statistics.get("lower_bound") is not None
            and self.statistics.get("native_objective") is not None
            and abs(self.statistics["native_objective"] - float(problem.value)) <= 1e-5
            and self.statistics["lower_bound"] <= float(problem.value) + 1e-6
        )
        return bool(usable), float(problem.value)

    def _read_native_statistics(self, raw: dict, inverse: list) -> None:
        offset = next(
            (
                item.get("offset")
                for item in reversed(inverse)
                if isinstance(item, dict) and "offset" in item
            ),
            None,
        )
        if offset is not None:
            offset = float(np.asarray(offset).item())
        info = raw.get("info")
        if info is not None:
            status = raw.get("model_status")
            self.statistics.update(
                native_status=status,
                native_solver_sec=raw.get("run_time"),
                termination={
                    "kOptimal": "OPTIMAL",
                    "kInfeasible": "INFEASIBLE",
                    "kTimeLimit": "TIME_LIMIT",
                    "kInterrupt": "INTERRUPTED",
                }.get(
                    status,
                    "SOLVER_LIMIT"
                    if status
                    in {
                        "kIterationLimit",
                        "kSolutionLimit",
                        "kObjectiveBound",
                        "kObjectiveTarget",
                    }
                    else "SOLVER_FAILED",
                ),
            )
            self.statistics["native_bound_source_valid"] = bool(
                getattr(info, "valid", False)
            )
            self.statistics["native_primal_available"] = bool(
                getattr(raw.get("solution"), "value_valid", False)
            )
            primal = getattr(info, "objective_function_value", None)
            bound = getattr(info, "mip_dual_bound", None)
            gap = getattr(info, "mip_gap", None)
        elif raw.get("model") is not None:
            model = raw["model"]
            status = model.Status
            self.statistics.update(
                native_status=status,
                native_solver_sec=model.Runtime,
                termination={
                    2: "OPTIMAL",
                    3: "INFEASIBLE",
                    9: "TIME_LIMIT",
                    11: "INTERRUPTED",
                }.get(
                    status,
                    "SOLVER_LIMIT"
                    if status in {7, 8, 10, 13, 15, 16, 17}
                    else "SOLVER_FAILED",
                ),
            )
            self.statistics["native_bound_source_valid"] = bool(
                model.IsMIP and model.SolCount
            )
            self.statistics["native_primal_available"] = bool(model.SolCount)
            primal = model.ObjVal if model.SolCount else None
            bound = getattr(model, "ObjBound", None)
            gap = model.MIPGap if model.SolCount and model.IsMIP else None
        else:
            return
        for name, value in (
            ("native_objective", primal),
            ("lower_bound", bound),
            ("native_relative_gap", gap),
        ):
            if (
                value is not None
                and np.isfinite(value)
                and (name == "native_relative_gap" or offset is not None)
            ):
                self.statistics[name] = float(value) + (
                    offset if name != "native_relative_gap" else 0.0
                )
        self.statistics["objective_offset"] = offset

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

        if (
            formulation.z_opened_terrain is not None
            and formulation.z_opened_terrain.value is not None
        ):
            opened_terrain_start = (
                isp.num_terrain_vars + isp.num_obstacle_vars + isp.num_slope_vars
            )
            z_val[
                opened_terrain_start : opened_terrain_start
                + isp.num_opened_terrain_vars
            ] = np.clip(formulation.z_opened_terrain.value, 0.0, 1.0)

        if (
            formulation.z_robot_speed is not None
            and formulation.z_robot_speed.value is not None
        ):
            speed_start = isp.total_z_vars - isp.num_robot_speed_vars
            z_val[speed_start:] = np.clip(formulation.z_robot_speed.value, 0.0, 1.0)

        return isp.get_modifications(z_val)
