import heapq

from ..grid import Grid
from .heuristics import euclidean_time_heuristic


def astar(
    grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    active_nodes: set[tuple[int, int]] | None = None,
    active_edges: set[tuple[tuple[int, int], tuple[int, int]]] | None = None,
    custom_edge_costs: dict[tuple[tuple[int, int], tuple[int, int]], float]
    | None = None,
) -> tuple[list[tuple[int, int]] | None, float, int]:
    if not (0 <= start[0] < grid.h and 0 <= start[1] < grid.w):
        return None, float("inf"), 0
    if not (0 <= goal[0] < grid.h and 0 <= goal[1] < grid.w):
        return None, float("inf"), 0
    if not grid.is_traversable(start, start) or not grid.is_traversable(goal, goal):
        return None, float("inf"), 0
    if active_nodes is not None and (
        start not in active_nodes or goal not in active_nodes
    ):
        return None, float("inf"), 0

    adj = None
    if active_edges is not None:
        adj = {}
        for u, v in active_edges:
            adj.setdefault(u, []).append(v)

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

        if adj is not None:
            candidate_neighbors = adj.get(current, [])
        else:
            candidate_neighbors = grid.get_neighbors(current, only_traversable=True)

        for neighbor in candidate_neighbors:
            if neighbor in closed_set:
                continue

            if active_nodes is not None and neighbor not in active_nodes:
                continue

            edge = (current, neighbor)
            if custom_edge_costs is not None and edge in custom_edge_costs:
                cost_edge = custom_edge_costs[edge]
            else:
                if not grid.is_traversable(current, neighbor):
                    continue
                cost_edge = grid.get_cost(current, neighbor)

            if cost_edge == float("inf"):
                continue

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
