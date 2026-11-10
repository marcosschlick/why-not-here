from ..grid import Grid


def traversable_component(grid: Grid, start: tuple[int, int]) -> set[tuple[int, int]]:
    if not grid.is_cell_traversable(start):
        return set()
    component = {start}
    stack = [start]
    while stack:
        current = stack.pop()
        for neighbor in grid.get_neighbors(current, only_traversable=True):
            if neighbor not in component:
                component.add(neighbor)
                stack.append(neighbor)
    return component


def largest_traversable_component(grid: Grid) -> set[tuple[int, int]]:
    remaining = {
        (row, col)
        for row in range(grid.h)
        for col in range(grid.w)
        if grid.is_cell_traversable((row, col))
    }
    if not remaining:
        return set()

    largest: set[tuple[int, int]] = set()
    while remaining:
        component = traversable_component(grid, min(remaining))
        remaining.difference_update(component)
        if len(component) > len(largest):
            largest = component
    return largest


def largest_traversable_component_ratio(grid: Grid) -> float:
    return len(largest_traversable_component(grid)) / (grid.h * grid.w)
