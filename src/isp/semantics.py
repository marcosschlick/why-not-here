import math
from itertools import pairwise

import numpy as np

from .. import config
from ..config import IMPASSABLE_TERRAINS
from ..grid import Grid
from ..grid.interventions import CellOpening, SlopeAdjustment, SpeedIntervention
from ..resources import require_memory
from .budget import check_deadline
from .modifier import apply_semantic_modifications
from .types import SemanticModifications


def terrain_change_weight(grid: Grid, node, path_interior: set) -> int:
    return 10 if grid.isp_model == "BRANDAO" and node not in path_interior else 1


def edge_is_possible(grid: Grid, edge, path_nodes, path_edges) -> bool:
    u, v = edge
    for node in edge:
        if not grid.is_cell_traversable(node) and (
            grid.isp_model == "BRANDAO" or node not in path_nodes
        ):
            return False
    slope_allowed = abs(grid.get_slope(u, v)) <= grid.max_slope_deg
    slope_can_be_adjusted = grid.isp_model == "NORMAL" and edge in path_edges
    return slope_allowed or slope_can_be_adjusted


class ISPSemantics:
    def __init__(
        self,
        grid: Grid,
        candidate_path: list[tuple[int, int]],
        active_nodes: set[tuple[int, int]] | None = None,
        active_edges: set[tuple[tuple[int, int], tuple[int, int]]] | None = None,
        custom_edge_costs: dict[tuple[tuple[int, int], tuple[int, int]], float]
        | None = None,
        terrain_decision_nodes: set[tuple[int, int]] | None = None,
    ) -> None:
        grid.validate_interventions()
        path_nodes = set(candidate_path)
        endpoints = {candidate_path[0], candidate_path[-1]} if candidate_path else set()
        path_edges = set(pairwise(candidate_path))
        node_count = (
            len(active_nodes | path_nodes)
            if active_nodes is not None
            else grid.h * grid.w
        )
        edge_count = (
            len(active_edges)
            if active_edges is not None
            else node_count * grid.connectivity
        )
        require_memory(node_count * 512 + edge_count * 2048, "ISP formulation")
        self.grid = grid
        self.candidate_path = candidate_path
        self.active_nodes = active_nodes
        self.active_edges = active_edges
        self.custom_edge_costs = (
            custom_edge_costs if custom_edge_costs is not None else {}
        )
        brandao = grid.isp_model == "BRANDAO"
        terrain_domain = (
            (
                terrain_decision_nodes
                if terrain_decision_nodes is not None
                else {(row, col) for row in range(grid.h) for col in range(grid.w)}
            )
            if brandao
            else set()
        )

        if active_nodes is None:
            self.nodes = [(row, col) for row in range(grid.h) for col in range(grid.w)]
        else:
            self.nodes = sorted(
                node
                for node in active_nodes | terrain_domain
                if 0 <= node[0] < grid.h and 0 <= node[1] < grid.w
            )
        self.node_to_idx = {node: index for index, node in enumerate(self.nodes)}

        unique_path_nodes = []
        seen_path_nodes = set()
        for u in candidate_path:
            if u not in seen_path_nodes and u in self.node_to_idx:
                seen_path_nodes.add(u)
                unique_path_nodes.append(u)

        self.terrain_nodes: list[tuple[int, int]] = []
        self.terrain_to_idx: dict[tuple[int, int], int] = {}
        self.terrain_classes = [
            terrain
            for terrain, speed in grid.speeds.items()
            if terrain not in IMPASSABLE_TERRAINS and np.isfinite(speed) and speed > 0.0
        ]
        self.terrain_class_to_idx = {
            terrain: i for i, terrain in enumerate(self.terrain_classes)
        }
        for u in sorted(terrain_domain - endpoints):
            if (
                not grid.get_cell(u).is_blocked
                and grid.get_cell(u).terrain in self.terrain_class_to_idx
            ):
                idx = len(self.terrain_nodes)
                self.terrain_nodes.append(u)
                self.terrain_to_idx[u] = idx

        self.cell_openings = []
        if not brandao:
            for node in unique_path_nodes:
                if node in endpoints or grid.is_cell_traversable(node):
                    continue
                cell = grid.get_cell(node)
                blocked_terrain = (
                    grid.is_impassable_terrain(node) and node not in grid.cell_openings
                )
                self.cell_openings.append(
                    CellOpening(
                        node,
                        cell.terrain,
                        cell.obstacle,
                        blocked_terrain,
                        grid.minimum_terrain_speed
                        if blocked_terrain
                        else grid._get_effective_speed(node),
                    )
                )
        self.opened_cells = {record.cell for record in self.cell_openings}

        self.edges: list[tuple[tuple[int, int], tuple[int, int]]] = []
        self.edge_to_idx: dict[tuple[tuple[int, int], tuple[int, int]], int] = {}

        for u in self.nodes:
            check_deadline()
            for v in grid.get_neighbors(u):
                if not edge_is_possible(grid, (u, v), path_nodes, path_edges):
                    continue
                if v not in self.node_to_idx:
                    continue
                edge = (u, v)
                if active_edges is not None and edge not in active_edges:
                    continue
                idx = len(self.edges)
                self.edges.append(edge)
                self.edge_to_idx[edge] = idx

        candidate_edge_pool = []
        if active_edges is not None:
            candidate_edge_pool.extend(active_edges)
        if self.custom_edge_costs:
            candidate_edge_pool.extend(self.custom_edge_costs.keys())

        for edge in candidate_edge_pool:
            if edge not in self.edge_to_idx and (
                edge in self.custom_edge_costs
                or edge_is_possible(grid, edge, path_nodes, path_edges)
            ):
                u, v = edge
                if u in self.node_to_idx and v in self.node_to_idx:
                    idx = len(self.edges)
                    self.edges.append(edge)
                    self.edge_to_idx[edge] = idx

        self.slope_adjustments = []
        self.environmental_speed_edges = []
        self.robot_capability_edges = []
        ratio = config.ROBOT_SPEED_ELIGIBILITY_RATIO
        if not np.isfinite(ratio) or not 0 <= ratio <= 1:
            raise ValueError(
                "The robot speed eligibility ratio must be finite and within [0, 1]."
            )
        if not brandao:
            for edge in dict.fromkeys(pairwise(candidate_path)):
                if edge not in self.edge_to_idx:
                    continue
                slope = grid.get_slope(*edge)
                if abs(slope) > grid.max_slope_deg:
                    self.slope_adjustments.append(
                        SlopeAdjustment(
                            edge, slope, math.copysign(grid.max_slope_deg, slope)
                        )
                    )
                if (
                    edge in grid.environmental_speed_edges
                    or edge in grid.robot_capability_edges
                ):
                    continue
                if edge in self.custom_edge_costs:
                    raise ValueError(
                        "Desired physical edges cannot have fixed shortcut costs."
                    )
                reference = grid.get_reference_velocity(*edge)
                environmental = reference < ratio * grid.robot_speed_normal
                record = SpeedIntervention(
                    edge,
                    reference,
                    grid.robot_speed_normal
                    if environmental
                    else grid.robot_speed_theoretical,
                )
                collection = (
                    self.environmental_speed_edges
                    if environmental
                    else self.robot_capability_edges
                )
                collection.append(record)
        self.corrected_edges = {record.edge for record in self.slope_adjustments}
        self.num_terrain_vars = len(self.terrain_nodes) * len(self.terrain_classes)

    def get_modifications(self, values: dict[str, np.ndarray]) -> SemanticModifications:
        assignments = []
        class_count = len(self.terrain_classes)
        for node in self.terrain_nodes:
            start = self.terrain_to_idx[node] * class_count
            for index, terrain in enumerate(self.terrain_classes):
                if (
                    values["terrain"][start + index] > 0.5
                    and terrain != self.grid.get_cell(node).terrain
                ):
                    assignments.append((node, terrain))
        return SemanticModifications(
            model=self.grid.isp_model,
            terrain_nodes=[node for node, _ in assignments],
            terrain_assignments=assignments,
            **{
                name: [
                    record
                    for index, record in enumerate(getattr(self, name))
                    if values[variable][index] > 0.5
                ]
                for name, variable in (
                    ("cell_openings", "cell_opening"),
                    ("slope_adjustments", "slope"),
                    ("environmental_speed_edges", "environmental_speed"),
                    ("robot_capability_edges", "robot_capability"),
                )
            },
        )

    @staticmethod
    def apply_modifications(grid: Grid, modifications: SemanticModifications) -> Grid:
        return apply_semantic_modifications(grid, modifications)
