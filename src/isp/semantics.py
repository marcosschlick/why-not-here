import numpy as np

from ..config import (
    BIG_M,
    EPSILON_L1,
    RHO_OBSTACLE,
    RHO_SLOPE,
    RHO_TERRAIN,
    TARGET_TERRAIN,
)
from ..grid import Grid
from .modifier import apply_semantic_modifications
from .types import SemanticModifications


class ISPSemantics:
    def __init__(
        self,
        grid: Grid,
        candidate_path: list[tuple[int, int]],
        active_nodes: set[tuple[int, int]] | None = None,
        active_edges: set[tuple[tuple[int, int], tuple[int, int]]] | None = None,
        custom_edge_costs: dict[tuple[tuple[int, int], tuple[int, int]], float]
        | None = None,
        rho_terrain: float = RHO_TERRAIN,
        rho_obstacle: float = RHO_OBSTACLE,
        rho_slope: float = RHO_SLOPE,
        epsilon_l1: float = EPSILON_L1,
        big_m: float = BIG_M,
    ) -> None:
        self.grid = grid
        self.candidate_path = candidate_path
        self.active_nodes = active_nodes
        self.active_edges = active_edges
        self.custom_edge_costs = (
            custom_edge_costs if custom_edge_costs is not None else {}
        )
        self.rho_terrain = rho_terrain
        self.rho_obstacle = rho_obstacle
        self.rho_slope = rho_slope
        self.epsilon_l1 = epsilon_l1
        self.big_m = big_m

        path_nodes = set(candidate_path)

        self.nodes: list[tuple[int, int]] = []
        self.node_to_idx: dict[tuple[int, int], int] = {}
        for i in range(grid.h):
            for j in range(grid.w):
                u = (i, j)
                if (
                    active_nodes is not None
                    and u not in active_nodes
                    and u not in path_nodes
                ):
                    continue
                idx = len(self.nodes)
                self.nodes.append(u)
                self.node_to_idx[u] = idx

        unique_path_nodes = []
        seen_path_nodes = set()
        for u in candidate_path:
            if u not in seen_path_nodes and u in self.node_to_idx:
                seen_path_nodes.add(u)
                unique_path_nodes.append(u)

        self.terrain_nodes: list[tuple[int, int]] = []
        self.terrain_to_idx: dict[tuple[int, int], int] = {}
        for u in unique_path_nodes:
            if (
                not grid.get_cell(u).is_blocked
                and grid.get_cell(u).terrain != TARGET_TERRAIN
            ):
                idx = len(self.terrain_nodes)
                self.terrain_nodes.append(u)
                self.terrain_to_idx[u] = idx

        self.obstacle_nodes: list[tuple[int, int]] = []
        self.obstacle_to_idx: dict[tuple[int, int], int] = {}
        for u in unique_path_nodes:
            if grid.get_cell(u).is_blocked:
                idx = len(self.obstacle_nodes)
                self.obstacle_nodes.append(u)
                self.obstacle_to_idx[u] = idx

        self.edges: list[tuple[tuple[int, int], tuple[int, int]]] = []
        self.edge_to_idx: dict[tuple[tuple[int, int], tuple[int, int]], int] = {}

        for u in self.nodes:
            for v in grid.get_neighbors(u):
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
            if edge not in self.edge_to_idx:
                u, v = edge
                if u in self.node_to_idx and v in self.node_to_idx:
                    idx = len(self.edges)
                    self.edges.append(edge)
                    self.edge_to_idx[edge] = idx

        self.slope_edges: list[tuple[tuple[int, int], tuple[int, int]]] = []
        self.slope_to_idx: dict[tuple[tuple[int, int], tuple[int, int]], int] = {}

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

        self.num_terrain_vars = len(self.terrain_nodes)
        self.num_obstacle_vars = len(self.obstacle_nodes)
        self.num_slope_vars = len(self.slope_edges)
        self.total_z_vars = (
            self.num_terrain_vars + self.num_obstacle_vars + self.num_slope_vars
        )

    def get_modifications(self, z: np.ndarray) -> SemanticModifications:
        z_terrain = z[: self.num_terrain_vars]
        z_obstacle = z[
            self.num_terrain_vars : self.num_terrain_vars + self.num_obstacle_vars
        ]
        z_slope = z[self.num_terrain_vars + self.num_obstacle_vars :]

        terrain_nodes = [
            u for u in self.terrain_nodes if z_terrain[self.terrain_to_idx[u]] > 0.5
        ]
        obstacle_nodes = [
            u for u in self.obstacle_nodes if z_obstacle[self.obstacle_to_idx[u]] > 0.5
        ]
        slope_edges = [
            edge for edge in self.slope_edges if z_slope[self.slope_to_idx[edge]] > 0.5
        ]

        return SemanticModifications(
            terrain_nodes=terrain_nodes,
            obstacle_nodes=obstacle_nodes,
            slope_edges=slope_edges,
        )

    @staticmethod
    def apply_modifications(grid: Grid, modifications: SemanticModifications) -> Grid:
        return apply_semantic_modifications(grid, modifications)
