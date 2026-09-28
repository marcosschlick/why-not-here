from ..grid import Grid
from .base import ReducedGraph, extract_induced_edges
from .bbox import extract_bbox

DIRECTIONS = (
    (-1, 0),
    (1, 0),
    (0, -1),
    (0, 1),
    (-1, -1),
    (-1, 1),
    (1, -1),
    (1, 1),
)


def extract_sparsified(
    grid: Grid,
    p_star: list[tuple[int, int]],
    p_prime: list[tuple[int, int]],
    margin: int = 2,
) -> ReducedGraph:
    bbox_graph = extract_bbox(grid, p_star, p_prime, margin=margin)
    essential_nodes = set(p_star) | set(p_prime)

    removed_nodes = set()
    for u in bbox_graph.nodes:
        if u in essential_nodes:
            continue
        nbrs = grid.get_neighbors(u)
        if (
            len(nbrs) == 8
            and (u[0] + u[1]) % 2 != 0
            and all(grid.get_cell(n).terrain == grid.get_cell(u).terrain for n in nbrs)
        ):
            removed_nodes.add(u)

    nodes = bbox_graph.nodes - removed_nodes
    edges = extract_induced_edges(grid, nodes)
    custom_edge_costs = {}

    for u in nodes:
        for dr, dc in DIRECTIONS:
            mid = (u[0] + dr, u[1] + dc)
            v = (u[0] + 2 * dr, u[1] + 2 * dc)
            if (
                mid in removed_nodes
                and v in nodes
                and grid.is_traversable(u, mid)
                and grid.is_traversable(mid, v)
            ):
                edges.add((u, v))
                custom_edge_costs[(u, v)] = grid.get_cost(u, mid) + grid.get_cost(
                    mid, v
                )

    return ReducedGraph(
        underlying_grid=grid,
        nodes=nodes,
        edges=edges,
        method_name="SPARSIFIED",
        custom_edge_costs=custom_edge_costs,
    )
