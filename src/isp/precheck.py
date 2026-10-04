from src.config import V_MAX
from src.grid.grid import Grid


def validate_alternative_path(
    grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    alternative_path: list[tuple[int, int]],
) -> tuple[bool, str | None, str | None]:
    if (
        not alternative_path
        or alternative_path[0] != start
        or alternative_path[-1] != goal
    ):
        return (
            False,
            "INVALID_ALTERNATIVE_PATH",
            "The alternative path does not match the supplied start and goal.",
        )

    for node in alternative_path:
        if not (0 <= node[0] < grid.h and 0 <= node[1] < grid.w):
            return (
                False,
                "INVALID_ALTERNATIVE_PATH",
                "The alternative path contains nodes outside the grid.",
            )

    if len(set(alternative_path)) != len(alternative_path):
        return (
            False,
            "INVALID_ALTERNATIVE_PATH",
            "The alternative path contains repeated nodes.",
        )

    if len(alternative_path) == 1 and not grid.is_traversable(start, start):
        return (
            False,
            "DISCONNECTED_GRAPH",
            "Origin and destination coincide on an impassable cell; no valid path exists.",
        )

    for index in range(len(alternative_path) - 1):
        u, v = alternative_path[index], alternative_path[index + 1]
        if v not in grid.get_neighbors(u):
            return (
                False,
                "INVALID_ALTERNATIVE_PATH",
                "The alternative path contains non-adjacent nodes.",
            )

    return True, None, None


def check_geometric_feasibility(
    grid: Grid,
    alternative_path: list[tuple[int, int]],
    cost_p_star: float,
    tolerance: float,
) -> tuple[bool, str | None, str | None]:
    v_max = max(grid.speeds.values()) if grid.speeds else V_MAX
    if cost_p_star != float("inf") and len(alternative_path) >= 2:
        path_dist = sum(
            grid.get_distance(alternative_path[index], alternative_path[index + 1])
            for index in range(len(alternative_path) - 1)
        )
        t_min_prime = path_dist / v_max
        if t_min_prime > cost_p_star + tolerance:
            diff_pct = (
                ((t_min_prime - cost_p_star) / cost_p_star * 100.0)
                if cost_p_star > 0.0
                else 0.0
            )
            message = (
                f"The alternative route is physically too long ({path_dist:.1f} m). "
                f"Even at the grid's theoretical maximum speed ({v_max:.1f} m/s) "
                f"on flat terrain, its minimum travel time would be {t_min_prime:.2f} s, "
                f"greater than the optimal route time ({cost_p_star:.2f} s) "
                f"by {diff_pct:.1f}%."
            )
            return False, "GEOMETRICALLY_INFEASIBLE", message

    return True, None, None
