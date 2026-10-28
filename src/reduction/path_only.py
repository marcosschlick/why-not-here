from itertools import pairwise

from ..grid import Grid
from .base import ReducedGraph


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

    edges = set(pairwise(p_star)) | set(pairwise(p_prime))

    return ReducedGraph(
        underlying_grid=grid,
        nodes=nodes,
        edges=edges,
        method_name="PATH_ONLY",
    )
