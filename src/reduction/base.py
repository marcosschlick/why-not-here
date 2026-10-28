from dataclasses import dataclass, field
from itertools import pairwise

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
    custom_edge_paths: dict[
        tuple[tuple[int, int], tuple[int, int]], list[tuple[int, int]]
    ] = field(default_factory=dict)

    def expand_path(self, path: list[tuple[int, int]]) -> list[tuple[int, int]]:
        if not path:
            return []
        expanded = [path[0]]
        for edge in pairwise(path):
            expanded.extend(self.custom_edge_paths.get(edge, list(edge))[1:])
        return expanded


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
    terrain_decision_nodes: set[tuple[int, int]] | None = None,
) -> tuple[
    set[tuple[int, int]] | None,
    set[tuple[tuple[int, int], tuple[int, int]]] | None,
    dict[tuple[tuple[int, int], tuple[int, int]], float] | None,
]:
    if reduced_graph is not None:
        active_nodes = set(reduced_graph.nodes)
        active_edges = set(reduced_graph.edges)
        decision_nodes = set(alternative_path) | (terrain_decision_nodes or set())
        if custom_edge_costs is None:
            custom_edge_costs = dict(reduced_graph.custom_edge_costs)
        else:
            custom_edge_costs = dict(custom_edge_costs)
        for edge, path in reduced_graph.custom_edge_paths.items():
            if not decision_nodes.intersection(path):
                continue
            custom_edge_costs.pop(edge, None)
            active_edges.discard(edge)
            active_nodes.update(path)
            active_edges.update(pairwise(path))
            if edge[1] in grid.get_neighbors(edge[0]):
                active_edges.add(edge)
        for v in decision_nodes:
            active_nodes.add(v)
            for u in grid.get_neighbors(v):
                active_nodes.add(u)
                active_edges.add((u, v))
                active_edges.add((v, u))
    else:
        active_nodes = None
        active_edges = None
    return active_nodes, active_edges, custom_edge_costs
