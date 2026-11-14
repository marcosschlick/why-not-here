from src.grid.grid import Grid
from src.isp.semantics import ISPSemantics, SemanticModifications


class ISPValidator:
    @staticmethod
    def apply_modifications(
        grid: Grid,
        modifications: SemanticModifications,
    ) -> Grid:
        return ISPSemantics.apply_modifications(grid, modifications)

    @staticmethod
    def compute_path_cost(grid: Grid, path: list[tuple[int, int]]) -> float:
        if not path:
            return 0.0
        if len(path) == 1:
            u = path[0]
            if not (0 <= u[0] < grid.h and 0 <= u[1] < grid.w):
                return float("inf")
            return grid.get_cost(u, u)
        total_cost = 0.0
        for r in range(len(path) - 1):
            cost = grid.get_cost(path[r], path[r + 1])
            if cost == float("inf"):
                return float("inf")
            total_cost += cost
        return total_cost
