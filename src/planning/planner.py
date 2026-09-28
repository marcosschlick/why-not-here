from ..config import DEFAULT_PLANNER
from ..grid import Grid
from .astar import astar
from .dijkstra import dijkstra


def plan_path(
    grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    algorithm: str | None = None,
) -> tuple[list[tuple[int, int]] | None, float, int]:
    algo = (algorithm or DEFAULT_PLANNER).upper()
    if algo == "DIJKSTRA":
        return dijkstra(grid, start, goal)
    if algo == "ASTAR":
        return astar(grid, start, goal)
    raise ValueError(f"Unknown planner algorithm: {algo}")
