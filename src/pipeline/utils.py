from pathlib import Path

from src import config
from src.grid.grid import Grid
from src.map.validation import largest_traversable_component, traversable_component

ROOT_DIR = Path(__file__).resolve().parents[2]


def get_project_path(rel_path: str | Path) -> Path:
    p = Path(rel_path)
    if p.is_absolute():
        return p.resolve()
    return (ROOT_DIR / p).resolve()


def find_closest_traversable_cell(
    grid: Grid,
    target: tuple[int, int],
    allowed_nodes: set[tuple[int, int]] | None = None,
) -> tuple[int, int]:
    ti = max(0, min(grid.h - 1, target[0]))
    tj = max(0, min(grid.w - 1, target[1]))
    u_target = (ti, tj)

    if (allowed_nodes is None or u_target in allowed_nodes) and not grid.get_cell(
        u_target
    ).is_blocked:
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
            if allowed_nodes is not None and u not in allowed_nodes:
                continue
            if not grid.get_cell(u).is_blocked:
                valid_nbrs = [
                    v for v in grid.get_neighbors(u) if grid.is_traversable(u, v)
                ]
                if len(valid_nbrs) >= 2:
                    d = (u[0] - ti) ** 2 + (u[1] - tj) ** 2
                    candidates.append((d, u))

        if candidates:
            candidates.sort()
            return candidates[0][1]

    if allowed_nodes:
        return min(
            allowed_nodes, key=lambda u: ((u[0] - ti) ** 2 + (u[1] - tj) ** 2, u)
        )
    return u_target


def prepare_endpoints(
    grid: Grid,
    start: tuple[int, int] | None = None,
    goal: tuple[int, int] | None = None,
) -> tuple[tuple[int, int], tuple[int, int]]:
    start_value = start if start is not None else config.START_COORD
    goal_value = goal if goal is not None else config.GOAL_COORD
    start = (
        (int(start_value[0]), int(start_value[1])) if start_value is not None else None
    )
    goal = (int(goal_value[0]), int(goal_value[1])) if goal_value is not None else None
    for node in (start, goal):
        if node is None:
            continue
        if not (0 <= node[0] < grid.h and 0 <= node[1] < grid.w):
            raise ValueError(f"Endpoint {node} falls outside the grid.")
        cell = grid.get_cell(node)
        if (
            cell.terrain in config.IMPASSABLE_TERRAINS
            or grid.speeds.get(cell.terrain, 0.0) <= 0.0
        ):
            raise ValueError(f"Endpoint {node} is on impassable terrain.")
        cell.obstacle = 0

    allowed_nodes = None
    if start is None or goal is None:
        anchor = start if start is not None else goal
        allowed_nodes = (
            traversable_component(grid, anchor)
            if anchor is not None
            else largest_traversable_component(grid)
        )
        if not allowed_nodes:
            raise ValueError(
                "No traversable component is available for automatic endpoints."
            )

    if start is None:
        raw_start = (max(1, int(grid.h * 0.1)), max(1, int(grid.w * 0.1)))
        start = find_closest_traversable_cell(grid, raw_start, allowed_nodes)

    if goal is None:
        raw_goal = (
            min(grid.h - 2, int(grid.h * 0.9)),
            min(grid.w - 2, int(grid.w * 0.9)),
        )
        goal = find_closest_traversable_cell(grid, raw_goal, allowed_nodes)

    grid.get_cell(start).obstacle = 0
    grid.get_cell(goal).obstacle = 0
    return start, goal


def create_alternative_path(
    grid: Grid, start: tuple[int, int], goal: tuple[int, int]
) -> list[tuple[int, int]]:
    if start == goal:
        return [start]
    mid_r = (start[0] + goal[0]) // 2
    mid_c = (start[1] + goal[1]) // 2
    offset = max(2, int(min(grid.h, grid.w) * 0.2))
    waypoint = (
        min(max(0, grid.h - 2), max(0, mid_r - offset)),
        min(max(0, grid.w - 2), max(0, mid_c + offset)),
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

    route = connect(start, waypoint) + connect(waypoint, goal) + [goal]
    path: list[tuple[int, int]] = []
    for node in route:
        if node in path:
            path = path[: path.index(node) + 1]
        else:
            path.append(node)
    return path
