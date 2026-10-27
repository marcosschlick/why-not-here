from dataclasses import dataclass, field

import cvxpy as cp
import numpy as np


@dataclass
class SemanticModifications:
    terrain_nodes: list[tuple[int, int]]
    obstacle_nodes: list[tuple[int, int]]
    slope_edges: list[tuple[tuple[int, int], tuple[int, int]]]
    water_nodes: list[tuple[int, int]] = field(default_factory=list)


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
    z_water: cp.Variable | None
