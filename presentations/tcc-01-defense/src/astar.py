import heapq

import config


def astar(grid, start, goal):
    grid_size = config.GRID_SIZE
    moves = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    closed_set = set()
    came_from = {}
    g_score = {start: 0}
    f_score = {start: _manhattan_distance(start, goal)}
    counter = 0
    priority_queue = [(f_score[start], counter, start)]

    while priority_queue:
        _, _, current = heapq.heappop(priority_queue)

        if current == goal:
            path = []
            while current in came_from:
                path.append(current)
                current = came_from[current]
            path.append(start)
            path.reverse()
            return path

        closed_set.add(current)

        row, col = current
        for dr, dc in moves:
            neighbor_row, neighbor_col = row + dr, col + dc

            if (
                neighbor_row < 0
                or neighbor_row >= grid_size
                or neighbor_col < 0
                or neighbor_col >= grid_size
            ):
                continue

            neighbor = (neighbor_row, neighbor_col)
            cell_data = grid[neighbor_row][neighbor_col]

            if not cell_data["traversable"]:
                continue

            move_cost = cell_data["cost"]
            tentative_g = g_score[current] + move_cost

            if neighbor in closed_set and tentative_g >= g_score.get(
                neighbor, float("inf")
            ):
                continue

            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f_score[neighbor] = tentative_g + _manhattan_distance(neighbor, goal)
                counter += 1
                heapq.heappush(priority_queue, (f_score[neighbor], counter, neighbor))

    raise RuntimeError("No route found between start and goal.")


def _manhattan_distance(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])
