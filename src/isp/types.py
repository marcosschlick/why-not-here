from dataclasses import dataclass, field, replace

import cvxpy as cp
import numpy as np


@dataclass
class SemanticModifications:
    terrain_nodes: list[tuple[int, int]]
    obstacle_nodes: list[tuple[int, int]]
    slope_edges: list[tuple[tuple[int, int], tuple[int, int]]]
    opened_terrain_nodes: list[tuple[int, int]] = field(default_factory=list)
    terrain_assignments: list[tuple[tuple[int, int], str]] = field(default_factory=list)
    robot_speed_edges: list[tuple[tuple[int, int], tuple[int, int]]] = field(
        default_factory=list
    )

    def __post_init__(self) -> None:
        self.opened_terrain_nodes = sorted(set(self.opened_terrain_nodes))


@dataclass
class MIPFormulation:
    isp: object
    x_alt: np.ndarray
    w_prime: cp.Expression
    w_min: np.ndarray
    extra_constraints: list[cp.Constraint]
    obj_terms: list[cp.Expression]
    z_terrain: cp.Variable | None
    z_obstacle: cp.Variable | None
    z_slope: cp.Variable | None
    z_opened_terrain: cp.Variable | None
    z_robot_speed: cp.Variable | None


def marker_modifications(modifications: SemanticModifications) -> SemanticModifications:
    opened = set(modifications.opened_terrain_nodes)
    terrain = set(modifications.terrain_nodes)
    return replace(
        modifications,
        obstacle_nodes=[
            node
            for node in modifications.obstacle_nodes
            if node not in opened | terrain
        ],
        terrain_nodes=[
            node for node in modifications.terrain_nodes if node not in opened
        ],
    )
