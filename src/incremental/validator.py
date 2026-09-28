from src.config import INCREMENTAL_TOLERANCE
from src.grid.grid import Grid
from src.isp.semantics import ISPSemantics, SemanticModifications
from src.planning.astar import astar

from .explanation import (
    generate_cost_baseline_justification,
    generate_explanation_text,
)


class ISPValidator:
    @staticmethod
    def apply_modifications(
        grid: Grid,
        modifications: SemanticModifications,
    ) -> Grid:
        return ISPSemantics.apply_modifications(grid, modifications)

    @staticmethod
    def compute_path_cost(grid: Grid, path: list[tuple[int, int]]) -> float:
        if not path or len(path) < 2:
            return 0.0
        total_cost = 0.0
        for r in range(len(path) - 1):
            cost = grid.get_cost(path[r], path[r + 1])
            if cost == float("inf"):
                return float("inf")
            total_cost += cost
        return total_cost

    @staticmethod
    def generate_explanation_text(
        modifications: SemanticModifications | None,
        grid: Grid | None = None,
    ) -> str:
        return generate_explanation_text(modifications, grid)

    @staticmethod
    def generate_cost_baseline_justification(
        cost_p_star: float, cost_p_prime: float
    ) -> str:
        return generate_cost_baseline_justification(cost_p_star, cost_p_prime)


def validate_global_optimality(
    full_grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    alternative_path: list[tuple[int, int]],
    modifications: SemanticModifications,
    tolerance: float = INCREMENTAL_TOLERANCE,
) -> tuple[bool, list[tuple[int, int]] | None, float, float]:
    mod_grid = ISPValidator.apply_modifications(full_grid, modifications)

    if (
        not alternative_path
        or alternative_path[0] != start
        or alternative_path[-1] != goal
    ):
        q_global, q_cost, _ = astar(mod_grid, start, goal)
        return (
            False,
            q_global,
            float("inf"),
            q_cost if q_global is not None else float("inf"),
        )

    if start == goal and len(alternative_path) == 1:
        return True, None, 0.0, 0.0

    p_cost = ISPValidator.compute_path_cost(mod_grid, alternative_path)

    q_global, q_cost, _ = astar(mod_grid, start, goal)
    if q_global is None:
        q_cost = float("inf")

    if p_cost != float("inf") and q_global is not None and p_cost <= q_cost + tolerance:
        return True, None, p_cost, q_cost

    return False, q_global, p_cost, q_cost
