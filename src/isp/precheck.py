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
