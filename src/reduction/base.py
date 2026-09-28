from dataclasses import dataclass, field

from ..grid import Grid


@dataclass
class ReducedGraph:
    underlying_grid: Grid
    nodes: set[tuple[int, int]]
    edges: set[tuple[tuple[int, int], tuple[int, int]]]
    method_name: str
    custom_edge_costs: dict[tuple[tuple[int, int], tuple[int, int]], float] = field(
        default_factory=dict
    )


def extract_induced_edges(
    grid: Grid, nodes: set[tuple[int, int]]
) -> set[tuple[tuple[int, int], tuple[int, int]]]:
    edges = set()
    for u in nodes:
        for v in grid.get_neighbors(u):
            if v in nodes:
                edges.add((u, v))
    return edges


def prepare_subgraph(
    grid: Grid,
    alternative_path: list[tuple[int, int]],
    reduced_graph: ReducedGraph | None = None,
    custom_edge_costs: dict[tuple[tuple[int, int], tuple[int, int]], float]
    | None = None,
) -> tuple[
    set[tuple[int, int]] | None,
    set[tuple[tuple[int, int], tuple[int, int]]] | None,
    dict[tuple[tuple[int, int], tuple[int, int]], float] | None,
]:
    if reduced_graph is not None:
        active_nodes = set(reduced_graph.nodes)
        active_edges = set(reduced_graph.edges)
        for v in alternative_path:
            active_nodes.add(v)
            for u in grid.get_neighbors(v):
                active_nodes.add(u)
                active_edges.add((u, v))
                active_edges.add((v, u))
        if custom_edge_costs is None:
            custom_edge_costs = reduced_graph.custom_edge_costs
    else:
        active_nodes = None
        active_edges = None
    return active_nodes, active_edges, custom_edge_costs
