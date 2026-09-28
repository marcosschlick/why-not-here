from ..grid import Grid
from .base import ReducedGraph, extract_induced_edges


def extract_path_only(
    grid: Grid,
    p_star: list[tuple[int, int]],
    p_prime: list[tuple[int, int]],
) -> ReducedGraph:
    nodes = set(p_star) | set(p_prime)
    if not nodes:
        return ReducedGraph(
            underlying_grid=grid,
            nodes=set(),
            edges=set(),
            method_name="PATH_ONLY",
        )

    edges = extract_induced_edges(grid, nodes)

    return ReducedGraph(
        underlying_grid=grid,
        nodes=nodes,
        edges=edges,
        method_name="PATH_ONLY",
    )
