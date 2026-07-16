import heapq
import math


def _manhattan_distance(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def _euclidean_distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


_HEURISTICS = {
    "manhattan": _manhattan_distance,
    "euclidean": _euclidean_distance,
}
_ORTHOGONAL_MOVES = [(-1, 0), (1, 0), (0, -1), (0, 1)]


def astar(grid, start, goal, heuristic_name):
    try:
        heuristic = _HEURISTICS[heuristic_name]
    except KeyError as error:
        supported = ", ".join(_HEURISTICS)
        raise ValueError(
            f"Unsupported A* heuristic '{heuristic_name}'. "
            f"Expected one of: {supported}."
        ) from error

    row_count = len(grid)
    column_count = len(grid[0])
    closed_set = set()
    came_from = {}
    g_score = {start: 0}

    # The tie breaker preserves insertion order when priorities are equal.
    tie_breaker = 0
    priority_queue = [(heuristic(start, goal), tie_breaker, start)]

    while priority_queue:
        _, _, current = heapq.heappop(priority_queue)

        if current == goal:
            return _reconstruct_path(came_from, start, current)

        closed_set.add(current)

        row, column = current
        for row_delta, column_delta in _ORTHOGONAL_MOVES:
            neighbor_row = row + row_delta
            neighbor_column = column + column_delta

            if (
                neighbor_row < 0
                or neighbor_row >= row_count
                or neighbor_column < 0
                or neighbor_column >= column_count
            ):
                continue

            neighbor = (neighbor_row, neighbor_column)
            cell = grid[neighbor_row][neighbor_column]

            if not cell["traversable"]:
                continue

            tentative_cost = g_score[current] + cell["cost"]

            if neighbor in closed_set and tentative_cost >= g_score.get(
                neighbor, float("inf")
            ):
                continue

            if tentative_cost < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_cost
                estimated_total_cost = tentative_cost + heuristic(neighbor, goal)
                tie_breaker += 1
                heapq.heappush(
                    priority_queue,
                    (estimated_total_cost, tie_breaker, neighbor),
                )

    raise RuntimeError("No route found between start and goal.")


def _reconstruct_path(came_from, start, current):
    path = []
    while current in came_from:
        path.append(current)
        current = came_from[current]
    path.append(start)
    path.reverse()
    return path
