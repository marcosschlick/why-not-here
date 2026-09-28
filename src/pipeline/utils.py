from pathlib import Path

from src import config
from src.grid.grid import Grid

ROOT_DIR = Path(__file__).resolve().parents[2]


def get_project_path(rel_path: str | Path) -> Path:
    p = Path(rel_path)
    if p.is_absolute():
        return p.resolve()
    return (ROOT_DIR / p).resolve()


def find_closest_traversable_cell(
    grid: Grid, target: tuple[int, int]
) -> tuple[int, int]:
    ti = max(0, min(grid.h - 1, target[0]))
    tj = max(0, min(grid.w - 1, target[1]))
    u_target = (ti, tj)

    if not grid.get_cell(u_target).is_blocked:
        valid_nbrs = [
            v for v in grid.get_neighbors(u_target) if grid.is_traversable(u_target, v)
        ]
        if len(valid_nbrs) >= 2:
            return u_target

    max_radius = max(grid.h, grid.w)
    for radius in range(1, max_radius):
        candidates = []
        r_min = max(0, ti - radius)
        r_max = min(grid.h - 1, ti + radius)
        c_min = max(0, tj - radius)
        c_max = min(grid.w - 1, tj + radius)

        ring_cells = set()
        for c in range(c_min, c_max + 1):
            ring_cells.add((r_min, c))
            ring_cells.add((r_max, c))
        for r in range(r_min + 1, r_max):
            ring_cells.add((r, c_min))
            ring_cells.add((r, c_max))

        for u in ring_cells:
            if not grid.get_cell(u).is_blocked:
                valid_nbrs = [
                    v for v in grid.get_neighbors(u) if grid.is_traversable(u, v)
                ]
                if len(valid_nbrs) >= 2:
                    d = (u[0] - ti) ** 2 + (u[1] - tj) ** 2
                    candidates.append((d, u))

        if candidates:
            candidates.sort(key=lambda item: item[0])
            return candidates[0][1]

    return u_target


def prepare_endpoints(grid: Grid) -> tuple[tuple[int, int], tuple[int, int]]:
    raw_start = (
        config.START_COORD
        if config.START_COORD is not None
        else (max(1, int(grid.h * 0.1)), max(1, int(grid.w * 0.1)))
    )
    raw_goal = (
        config.GOAL_COORD
        if config.GOAL_COORD is not None
        else (min(grid.h - 2, int(grid.h * 0.9)), min(grid.w - 2, int(grid.w * 0.9)))
    )
    start = find_closest_traversable_cell(grid, raw_start)
    goal = find_closest_traversable_cell(grid, raw_goal)
    grid.get_cell(start).obstacle = 0
    grid.get_cell(goal).obstacle = 0
    return start, goal


def create_alternative_path(
    grid: Grid, start: tuple[int, int], goal: tuple[int, int]
) -> list[tuple[int, int]]:
    mid_r = (start[0] + goal[0]) // 2
    mid_c = (start[1] + goal[1]) // 2
    offset = max(2, int(min(grid.h, grid.w) * 0.2))
    waypoint = (
        min(grid.h - 2, max(1, mid_r - offset)),
        min(grid.w - 2, max(1, mid_c + offset)),
    )

    def connect(p1: tuple[int, int], p2: tuple[int, int]) -> list[tuple[int, int]]:
        r, c = p1
        r_end, c_end = p2
        pts = []
        while (r, c) != (r_end, c_end):
            pts.append((r, c))
            dr = 1 if r_end > r else (-1 if r_end < r else 0)
            dc = 1 if c_end > c else (-1 if c_end < c else 0)
            if grid.connectivity == 4 and dr != 0 and dc != 0:
                r += dr
            else:
                r += dr
                c += dc
        return pts

    return connect(start, waypoint) + connect(waypoint, goal) + [goal]
