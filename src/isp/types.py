from dataclasses import dataclass, field

import cvxpy as cp
import numpy as np

from ..grid.interventions import CellOpening, SlopeAdjustment, SpeedIntervention


@dataclass
class SemanticModifications:
    model: str = "NORMAL"
    terrain_nodes: list[tuple[int, int]] = field(default_factory=list)
    terrain_assignments: list[tuple[tuple[int, int], str]] = field(default_factory=list)
    cell_openings: list[CellOpening] = field(default_factory=list)
    slope_adjustments: list[SlopeAdjustment] = field(default_factory=list)
    environmental_speed_edges: list[SpeedIntervention] = field(default_factory=list)
    robot_capability_edges: list[SpeedIntervention] = field(default_factory=list)

    def __post_init__(self):
        if self.model not in {"NORMAL", "BRANDAO"}:
            raise ValueError("Unknown intervention model.")
        if self.model == "NORMAL" and (self.terrain_nodes or self.terrain_assignments):
            raise ValueError("Normal interventions cannot change terrain classes.")
        if self.model == "BRANDAO" and any(
            (
                self.cell_openings,
                self.slope_adjustments,
                self.environmental_speed_edges,
                self.robot_capability_edges,
            )
        ):
            raise ValueError("Brandao interventions can only change terrain classes.")
        if sorted(self.terrain_nodes) != sorted(
            node for node, _ in self.terrain_assignments
        ):
            raise ValueError("Terrain change coordinates do not match the assignments.")
        for records, key_name in (
            (self.cell_openings, "cell"),
            (self.slope_adjustments, "edge"),
            (self.environmental_speed_edges, "edge"),
            (self.robot_capability_edges, "edge"),
        ):
            keys = [getattr(record, key_name) for record in records]
            if len(keys) != len(set(keys)):
                raise ValueError("Duplicate intervention records.")
        if len(self.terrain_nodes) != len(set(self.terrain_nodes)):
            raise ValueError("Duplicate terrain assignments.")
        if {record.edge for record in self.environmental_speed_edges} & {
            record.edge for record in self.robot_capability_edges
        }:
            raise ValueError(
                "An edge cannot contain both speed intervention categories."
            )


@dataclass
class MIPFormulation:
    isp: object
    x_alt: np.ndarray
    w_prime: cp.Expression
    w_min: np.ndarray
    extra_constraints: list[cp.Constraint]
    obj_terms: list[cp.Expression]
    z_terrain: cp.Variable | None
    z_cell_opening: cp.Variable | None
    z_slope: cp.Variable | None
    z_environmental_speed: cp.Variable | None
    z_robot_capability: cp.Variable | None
