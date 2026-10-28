from collections import deque
from math import isfinite

from ..config import IMPASSABLE_TERRAINS, WATER_TERRAIN
from ..grid import Grid
from .base import ReducedGraph
from .bbox import extract_bbox


def _edge_indicators(
    grid: Grid,
    u: tuple[int, int],
    v: tuple[int, int],
) -> tuple[bool, bool]:
    terrain_blocked = False
    for node in (u, v):
        cell = grid.get_cell(node)
        water_override = cell.terrain == WATER_TERRAIN and node in grid.water_overrides
        if cell.obstacle != 0 or (
            cell.terrain in IMPASSABLE_TERRAINS and not water_override
        ):
            terrain_blocked = True
    return terrain_blocked, abs(grid.get_slope(u, v)) > grid.max_slope_deg


def extract_sparsified(
    grid: Grid,
    p_star: list[tuple[int, int]],
    p_prime: list[tuple[int, int]],
    protected_nodes: set[tuple[int, int]] | None = None,
) -> ReducedGraph:
    bbox_graph = extract_bbox(grid, p_star, p_prime)
    protected = set(p_star) | set(p_prime) | (protected_nodes or set())
    outgoing = {node: {} for node in bbox_graph.nodes}
    incoming = {node: set() for node in bbox_graph.nodes}
    indicators = {}
    for u, v in bbox_graph.edges:
        cost = grid.get_cost(u, v)
        outgoing[u][v] = cost
        incoming[v].add(u)
        if isfinite(cost):
            indicators[(u, v)] = _edge_indicators(grid, u, v)

    custom_edge_costs = {}
    custom_edge_paths = {}
    queue = deque(sorted(bbox_graph.nodes - protected))
    while queue:
        middle = queue.popleft()
        if middle not in outgoing or middle in protected:
            continue
        neighbors = {
            node for node, cost in outgoing[middle].items() if isfinite(cost)
        } | {node for node in incoming[middle] if isfinite(outgoing[node][middle])}
        if len(neighbors) != 2:
            continue
        u, w = sorted(neighbors)
        shortcuts = []
        compatible = True
        for source, target in ((u, w), (w, u)):
            first = (source, middle)
            second = (middle, target)
            if first not in indicators or second not in indicators:
                continue
            if indicators[first] != indicators[second]:
                compatible = False
                break
            cost = outgoing[source][middle] + outgoing[middle][target]
            physical_path = (
                custom_edge_paths.get(first, [source, middle])
                + custom_edge_paths.get(second, [middle, target])[1:]
            )
            shortcuts.append(((source, target), cost, physical_path, indicators[first]))
        if not compatible or not shortcuts:
            continue

        incident_edges = {(node, middle) for node in incoming[middle]} | {
            (middle, node) for node in outgoing[middle]
        }
        for source, target in incident_edges:
            outgoing[source].pop(target)
            incoming[target].remove(source)
            indicators.pop((source, target), None)
            custom_edge_costs.pop((source, target), None)
            custom_edge_paths.pop((source, target), None)
        del outgoing[middle]
        del incoming[middle]

        for edge, cost, physical_path, flags in shortcuts:
            source, target = edge
            if cost < outgoing[source].get(target, float("inf")):
                outgoing[source][target] = cost
                incoming[target].add(source)
                indicators[edge] = flags
                custom_edge_costs[edge] = cost
                custom_edge_paths[edge] = physical_path
        queue.extend(node for node in sorted(neighbors) if node not in protected)

    return ReducedGraph(
        underlying_grid=grid,
        nodes=set(outgoing),
        edges={(u, v) for u in outgoing for v in outgoing[u]},
        method_name="SPARSIFIED",
        custom_edge_costs=custom_edge_costs,
        custom_edge_paths=custom_edge_paths,
    )
