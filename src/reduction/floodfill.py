from collections import deque

from ..grid import Grid
from .base import ReducedGraph, extract_induced_edges


def extract_floodfill(
    grid: Grid,
    p_star: list[tuple[int, int]],
    p_prime: list[tuple[int, int]],
) -> ReducedGraph:
    boundary = set(p_star) | set(p_prime)
    if not boundary:
        return ReducedGraph(
            underlying_grid=grid,
            nodes=set(),
            edges=set(),
            method_name="FLOODFILL",
        )

    r_coords = [p[0] for p in boundary]
    c_coords = [p[1] for p in boundary]
    r_min = max(0, min(r_coords) - 1)
    r_max = min(grid.h - 1, max(r_coords) + 1)
    c_min = max(0, min(c_coords) - 1)
    c_max = min(grid.w - 1, max(c_coords) + 1)

    exterior = set()
    queue = deque()

    for r in range(r_min, r_max + 1):
        for c in (c_min, c_max):
            pt = (r, c)
            if pt not in boundary and pt not in exterior:
                exterior.add(pt)
                queue.append(pt)

    for c in range(c_min, c_max + 1):
        for r in (r_min, r_max):
            pt = (r, c)
            if pt not in boundary and pt not in exterior:
                exterior.add(pt)
                queue.append(pt)

    while queue:
        curr = queue.popleft()
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = curr[0] + dr, curr[1] + dc
            if r_min <= nr <= r_max and c_min <= nc <= c_max:
                nbr = (nr, nc)
                if nbr not in boundary and nbr not in exterior:
                    exterior.add(nbr)
                    queue.append(nbr)

    nodes = {
        (r, c)
        for r in range(r_min, r_max + 1)
        for c in range(c_min, c_max + 1)
        if (r, c) not in exterior
    }

    edges = extract_induced_edges(grid, nodes)

    return ReducedGraph(
        underlying_grid=grid,
        nodes=nodes,
        edges=edges,
        method_name="FLOODFILL",
    )
