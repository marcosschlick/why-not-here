from itertools import pairwise

import numpy as np

from .. import config
from ..config import IMPASSABLE_TERRAINS
from ..grid import Grid
from ..resources import require_memory
from .budget import check_deadline
from .modifier import apply_semantic_modifications
from .types import SemanticModifications


def edge_is_possible(grid: Grid, edge, path_nodes, path_edges) -> bool:
    u, v = edge
    for node in edge:
        if not grid.is_cell_traversable(node) and (
            grid.isp_model == "BRANDAO" or node not in path_nodes
        ):
            return False
    slope_allowed = abs(grid.get_slope(u, v)) <= grid.max_slope_deg
    slope_can_be_leveled = grid.isp_model == "NORMAL" and bool(
        {edge, (v, u)} & path_edges
    )
    return slope_allowed or slope_can_be_leveled


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
        path_nodes = set(candidate_path)
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
            else path_nodes
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
        for u in sorted(terrain_domain):
            if (
                not grid.get_cell(u).is_blocked
                and grid.get_cell(u).terrain in self.terrain_class_to_idx
            ):
                idx = len(self.terrain_nodes)
                self.terrain_nodes.append(u)
                self.terrain_to_idx[u] = idx

        self.obstacle_nodes: list[tuple[int, int]] = []
        self.obstacle_to_idx: dict[tuple[int, int], int] = {}
        if not brandao:
            for u in unique_path_nodes:
                if grid.get_cell(u).obstacle != 0:
                    idx = len(self.obstacle_nodes)
                    self.obstacle_nodes.append(u)
                    self.obstacle_to_idx[u] = idx

        self.opened_terrain_nodes: list[tuple[int, int]] = []
        self.opened_terrain_to_idx: dict[tuple[int, int], int] = {}
        if not brandao:
            for u in unique_path_nodes:
                if (
                    grid.get_cell(u).terrain in IMPASSABLE_TERRAINS
                    and u not in grid.terrain_overrides
                ):
                    idx = len(self.opened_terrain_nodes)
                    self.opened_terrain_nodes.append(u)
                    self.opened_terrain_to_idx[u] = idx

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

        self.slope_edges: list[tuple[tuple[int, int], tuple[int, int]]] = []
        self.slope_to_idx: dict[tuple[tuple[int, int], tuple[int, int]], int] = {}

        if not brandao:
            for r in range(len(candidate_path) - 1):
                edge = (candidate_path[r], candidate_path[r + 1])
                if edge not in self.edge_to_idx or edge in self.slope_to_idx:
                    continue
                u, v = edge
                has_slope_pen = (
                    abs(grid.get_slope(u, v)) > grid.max_slope_deg
                    or grid.get_slope(u, v) > 1e-4
                )
                if (
                    has_slope_pen
                    and edge not in grid.leveled_slopes
                    and (v, u) not in grid.leveled_slopes
                ):
                    s_idx = len(self.slope_edges)
                    self.slope_edges.append(edge)
                    self.slope_to_idx[edge] = s_idx
                    self.slope_to_idx[(v, u)] = s_idx

        if not np.isfinite(
            grid.robot_speed_theoretical
        ) or grid.robot_speed_theoretical <= max(grid.speeds.values()):
            raise ValueError(
                "The theoretical robot speed must be finite and exceed the maximum nominal speed."
            )
        ratio = config.ROBOT_SPEED_ELIGIBILITY_RATIO
        if not np.isfinite(ratio) or not 0.0 <= ratio <= 1.0:
            raise ValueError(
                "The robot speed eligibility ratio must be finite and within [0, 1]."
            )
        self.robot_speed_edges = []
        self.robot_speed_to_idx = {}
        if not brandao:
            for edge in pairwise(candidate_path):
                if (
                    edge in self.robot_speed_to_idx
                    or edge in grid.robot_speed_edges
                    or edge in self.custom_edge_costs
                ):
                    continue
                cost = grid.get_cost(*edge)
                if (
                    np.isfinite(cost)
                    and cost > 0.0
                    and grid.get_distance(*edge) / cost
                    >= ratio * max(grid.speeds.values())
                ):
                    self.robot_speed_to_idx[edge] = len(self.robot_speed_edges)
                    self.robot_speed_edges.append(edge)

        self.num_terrain_vars = len(self.terrain_nodes) * len(self.terrain_classes)
        self.num_obstacle_vars = len(self.obstacle_nodes)
        self.num_slope_vars = len(self.slope_edges)
        self.num_opened_terrain_vars = len(self.opened_terrain_nodes)
        self.num_robot_speed_vars = len(self.robot_speed_edges)
        self.total_z_vars = (
            self.num_terrain_vars
            + self.num_obstacle_vars
            + self.num_slope_vars
            + self.num_opened_terrain_vars
            + self.num_robot_speed_vars
        )

    def get_modifications(self, z: np.ndarray) -> SemanticModifications:
        z_terrain = z[: self.num_terrain_vars]
        z_obstacle = z[
            self.num_terrain_vars : self.num_terrain_vars + self.num_obstacle_vars
        ]
        slope_end = self.num_terrain_vars + self.num_obstacle_vars + self.num_slope_vars
        z_slope = z[self.num_terrain_vars + self.num_obstacle_vars : slope_end]
        z_opened_terrain = z[slope_end : slope_end + self.num_opened_terrain_vars]

        terrain_assignments = []
        class_count = len(self.terrain_classes)
        for u in self.terrain_nodes:
            start = self.terrain_to_idx[u] * class_count
            for j, terrain in enumerate(self.terrain_classes):
                if (
                    z_terrain[start + j] > 0.5
                    and terrain != self.grid.get_cell(u).terrain
                ):
                    terrain_assignments.append((u, terrain))
        terrain_nodes = [u for u, _ in terrain_assignments]
        obstacle_nodes = [
            u for u in self.obstacle_nodes if z_obstacle[self.obstacle_to_idx[u]] > 0.5
        ]
        slope_edges = [
            edge for edge in self.slope_edges if z_slope[self.slope_to_idx[edge]] > 0.5
        ]
        opened_terrain_nodes = [
            u
            for u in self.opened_terrain_nodes
            if z_opened_terrain[self.opened_terrain_to_idx[u]] > 0.5
        ]
        speed_start = slope_end + self.num_opened_terrain_vars
        robot_speed_edges = [
            edge
            for edge in self.robot_speed_edges
            if z[speed_start + self.robot_speed_to_idx[edge]] > 0.5
        ]

        return SemanticModifications(
            terrain_nodes=terrain_nodes,
            obstacle_nodes=obstacle_nodes,
            slope_edges=slope_edges,
            opened_terrain_nodes=opened_terrain_nodes,
            terrain_assignments=terrain_assignments,
            robot_speed_edges=robot_speed_edges,
        )

    @staticmethod
    def apply_modifications(grid: Grid, modifications: SemanticModifications) -> Grid:
        return apply_semantic_modifications(grid, modifications)
