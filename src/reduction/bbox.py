from ..grid import Grid
from .base import ReducedGraph, extract_induced_edges


def extract_bbox(
    grid: Grid,
    p_star: list[tuple[int, int]],
    p_prime: list[tuple[int, int]],
) -> ReducedGraph:
    all_points = p_star + p_prime
    if not all_points:
        return ReducedGraph(
            underlying_grid=grid,
            nodes=set(),
            edges=set(),
            method_name="BBOX",
        )

    r_coords = [p[0] for p in all_points]
    c_coords = [p[1] for p in all_points]
    r_min = min(r_coords)
    r_max = max(r_coords)
    c_min = min(c_coords)
    c_max = max(c_coords)

    nodes = {(r, c) for r in range(r_min, r_max + 1) for c in range(c_min, c_max + 1)}

    edges = extract_induced_edges(grid, nodes)

    return ReducedGraph(
        underlying_grid=grid,
        nodes=nodes,
        edges=edges,
        method_name="BBOX",
    )
