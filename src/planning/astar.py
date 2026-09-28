import heapq

from ..grid import Grid
from .heuristics import euclidean_time_heuristic


def astar(
    grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
) -> tuple[list[tuple[int, int]] | None, float, int]:

    if not (0 <= start[0] < grid.h and 0 <= start[1] < grid.w):
        return None, float("inf"), 0
    if not (0 <= goal[0] < grid.h and 0 <= goal[1] < grid.w):
        return None, float("inf"), 0
    if grid.get_cell(start).is_blocked or grid.get_cell(goal).is_blocked:
        return None, float("inf"), 0

    v_max = max(grid.speeds.values())

    counter = 0
    open_heap = []
    h_start = euclidean_time_heuristic(
        start, goal, cell_size=grid.cell_size, v_max=v_max
    )
    heapq.heappush(open_heap, (h_start, h_start, counter, start))
    g_score = {start: 0.0}
    came_from = {}
    closed_set = set()
    nodes_expanded = 0

    while open_heap:
        _, _, _, current = heapq.heappop(open_heap)

        if current in closed_set:
            continue

        closed_set.add(current)
        nodes_expanded += 1

        if current == goal:
            path = []
            curr = goal
            while curr in came_from:
                path.append(curr)
                curr = came_from[curr]
            path.append(curr)
            path.reverse()
            return path, g_score[goal], nodes_expanded

        for neighbor in grid.get_neighbors(current, only_traversable=True):
            if neighbor in closed_set:
                continue

            cost_edge = grid.get_cost(current, neighbor)
            tentative_g = g_score[current] + cost_edge
            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                h_val = euclidean_time_heuristic(
                    neighbor, goal, cell_size=grid.cell_size, v_max=v_max
                )
                f_val = tentative_g + h_val
                counter += 1
                heapq.heappush(open_heap, (f_val, h_val, counter, neighbor))

    return None, float("inf"), nodes_expanded
