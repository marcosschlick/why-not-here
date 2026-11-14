import math
from dataclasses import dataclass

Point = tuple[int, int]
Edge = tuple[Point, Point]


def point(value) -> Point:
    if len(value) != 2 or any(type(number) is not int for number in value):
        raise ValueError("A cell coordinate must contain two integers.")
    return tuple(value)


def edge(value) -> Edge:
    if len(value) != 2:
        raise ValueError("A directed edge must contain two cell coordinates.")
    return point(value[0]), point(value[1])


@dataclass(frozen=True)
class CellOpening:
    cell: Point
    original_terrain: str
    original_obstacle: int
    impassable_terrain: bool
    opened_speed_mps: float

    def __post_init__(self):
        object.__setattr__(self, "cell", point(self.cell))
        if (
            not isinstance(self.original_terrain, str)
            or type(self.original_obstacle) is not int
            or self.original_obstacle < 0
            or type(self.impassable_terrain) is not bool
            or not (self.original_obstacle or self.impassable_terrain)
            or not math.isfinite(self.opened_speed_mps)
            or self.opened_speed_mps <= 0
        ):
            raise ValueError("Invalid cell opening record.")


@dataclass(frozen=True)
class SlopeAdjustment:
    edge: Edge
    original_slope_deg: float
    effective_slope_deg: float

    def __post_init__(self):
        object.__setattr__(self, "edge", edge(self.edge))
        if not all(
            math.isfinite(value)
            for value in (self.original_slope_deg, self.effective_slope_deg)
        ):
            raise ValueError("Slope values must be finite.")


@dataclass(frozen=True)
class SpeedIntervention:
    edge: Edge
    reference_speed_mps: float
    target_speed_mps: float

    def __post_init__(self):
        object.__setattr__(self, "edge", edge(self.edge))
        if not all(
            math.isfinite(value) and value > 0
            for value in (self.reference_speed_mps, self.target_speed_mps)
        ):
            raise ValueError("Edge speeds must be finite and positive.")
