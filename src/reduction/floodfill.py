from bisect import bisect_right
from fractions import Fraction
from itertools import pairwise

from ..grid import Grid
from .base import ReducedGraph, extract_induced_edges


def extract_floodfill(
    grid: Grid,
    p_star: list[tuple[int, int]],
    p_prime: list[tuple[int, int]],
) -> ReducedGraph:
    boundary = set(p_star) | set(p_prime)
    crossings: dict[int, list[Fraction]] = {}
    for path in (p_star, p_prime):
        for (r1, c1), (r2, c2) in pairwise(path):
            if r1 == r2:
                continue
            for row in range(min(r1, r2), max(r1, r2)):
                column = Fraction(c1 * (r2 - r1) + (row - r1) * (c2 - c1), r2 - r1)
                crossings.setdefault(row, []).append(column)

    nodes = set(boundary)
    for row, columns in crossings.items():
        columns.sort()
        for column in range(max(0, int(columns[0])), min(grid.w, int(columns[-1]) + 1)):
            if (row, column) not in boundary and bisect_right(columns, column) % 2:
                nodes.add((row, column))

    return ReducedGraph(
        underlying_grid=grid,
        nodes=nodes,
        edges=extract_induced_edges(grid, nodes),
        method_name="FLOODFILL",
    )
