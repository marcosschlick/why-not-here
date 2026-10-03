from ..grid import Grid


def largest_traversable_component_ratio(grid: Grid) -> float:
    remaining = {
        (row, col)
        for row in range(grid.h)
        for col in range(grid.w)
        if not grid.get_cell((row, col)).is_blocked
        and grid.speeds.get(grid.get_cell((row, col)).terrain, 0.0) > 0.0
    }
    if not remaining:
        return 0.0

    total = len(remaining)
    largest = 0
    while remaining:
        start = remaining.pop()
        stack = [start]
        component_size = 0
        while stack:
            current = stack.pop()
            component_size += 1
            for neighbor in grid.get_neighbors(current):
                if neighbor not in remaining:
                    continue
                if grid.is_traversable(current, neighbor):
                    remaining.remove(neighbor)
                    stack.append(neighbor)
        largest = max(largest, component_size)
    return largest / total
