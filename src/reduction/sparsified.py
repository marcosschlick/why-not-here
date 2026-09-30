from ..grid import Grid
from .base import ReducedGraph, extract_induced_edges
from .bbox import extract_bbox


def extract_sparsified(
    grid: Grid,
    p_star: list[tuple[int, int]],
    p_prime: list[tuple[int, int]],
    margin: int = 2,
) -> ReducedGraph:
    bbox_graph = extract_bbox(grid, p_star, p_prime, margin=margin)
    essential_nodes = set(p_star) | set(p_prime)
    candidate_path_nodes = set(p_prime)
    removable_nodes = set()

    for u in bbox_graph.nodes:
        if u in essential_nodes or u[0] % 2 != 1 or u[1] % 2 != 1:
            continue

        neighbors = grid.get_neighbors(u)
        if len(neighbors) != 8 or candidate_path_nodes.intersection(neighbors):
            continue

        cell = grid.get_cell(u)
        if cell.is_blocked or grid.speeds.get(cell.terrain, 0.0) <= 0.0:
            continue

        if any(
            grid.get_cell(neighbor).is_blocked
            or grid.get_cell(neighbor).terrain != cell.terrain
            or grid.speeds.get(grid.get_cell(neighbor).terrain, 0.0) <= 0.0
            for neighbor in neighbors
        ):
            continue

        removable_nodes.add(u)

    nodes = bbox_graph.nodes - removable_nodes
    edges = extract_induced_edges(grid, nodes)
    custom_edge_costs: dict[
        tuple[tuple[int, int], tuple[int, int]], float
    ] = {}

    for middle in removable_nodes:
        neighbors = grid.get_neighbors(middle)
        for u in neighbors:
            if u not in nodes or not grid.is_traversable(u, middle):
                continue
            first_cost = grid.get_cost(u, middle)
            for v in neighbors:
                if v == u or v not in nodes or not grid.is_traversable(middle, v):
                    continue

                shortcut = (u, v)
                shortcut_cost = first_cost + grid.get_cost(middle, v)
                direct_cost = (
                    grid.get_cost(u, v)
                    if v in grid.get_neighbors(u)
                    else float("inf")
                )
                if direct_cost <= shortcut_cost:
                    continue

                edges.add(shortcut)
                custom_edge_costs[shortcut] = min(
                    shortcut_cost,
                    custom_edge_costs.get(shortcut, float("inf")),
                )

    return ReducedGraph(
        underlying_grid=grid,
        nodes=nodes,
        edges=edges,
        method_name="SPARSIFIED",
        custom_edge_costs=custom_edge_costs,
    )
