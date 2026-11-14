import copy
import json
import math
from dataclasses import asdict
from pathlib import Path

from .. import config
from ..config import (
    CONNECTIVITY,
    MAP_H,
    MAP_W,
)
from .cell import Cell
from .interventions import CellOpening, SlopeAdjustment, SpeedIntervention


class Grid:
    def __init__(
        self,
        h: int = MAP_H,
        w: int = MAP_W,
        cell_size: float | None = None,
        connectivity: int = CONNECTIVITY,
        max_slope_deg: float | None = None,
    ) -> None:
        self.isp_model = "NORMAL"
        self.h = h
        self.w = w
        self.cell_size = config.CELL_SIZE if cell_size is None else cell_size
        self.connectivity = connectivity
        self.max_slope_deg = (
            config.MAX_SLOPE_DEG if max_slope_deg is None else max_slope_deg
        )
        self.speeds = dict(config.TERRAINS)

        self.cells = []
        for i in range(h):
            row = []
            for j in range(w):
                row.append(Cell())
            self.cells.append(row)

        self.cell_openings: dict[tuple[int, int], CellOpening] = {}
        self.slope_adjustments: dict[tuple, SlopeAdjustment] = {}
        self.environmental_speed_edges: dict[tuple, SpeedIntervention] = {}
        self.robot_capability_edges: dict[tuple, SpeedIntervention] = {}
        self.robot_speed_normal = config.ROBOT_SPEED_NORMAL
        self.robot_speed_theoretical = config.ROBOT_SPEED_THEORETICAL
        self.base_seed: int | None = None
        self.effective_seed: int | None = None
        self.generation_attempt: int | None = None
        self.generation_profile: dict | None = None

    @property
    def isp_model_version(self) -> str:
        return (
            config.NORMAL_MODEL_VERSION
            if self.isp_model == "NORMAL"
            else "brandao-grid-v2"
        )

    @property
    def minimum_terrain_speed(self) -> float:
        return min(
            speed
            for terrain, speed in self.speeds.items()
            if terrain not in config.IMPASSABLE_TERRAINS
            and math.isfinite(speed)
            and speed > 0
        )

    def is_impassable_terrain(self, point: tuple[int, int]) -> bool:
        terrain = self.get_cell(point).terrain
        return terrain in config.IMPASSABLE_TERRAINS or self.speeds[terrain] <= 0

    def is_cell_traversable(self, point: tuple[int, int]) -> bool:
        return (
            self.get_cell(point).obstacle == 0 and self._get_effective_speed(point) > 0
        )

    def get_cell(self, u: tuple[int, int]) -> Cell:
        return self.cells[u[0]][u[1]]

    def get_distance(self, u: tuple[int, int], v: tuple[int, int]) -> float:
        return math.hypot(v[0] - u[0], v[1] - u[1]) * self.cell_size

    def get_original_slope(self, u: tuple[int, int], v: tuple[int, int]) -> float:
        distance = self.get_distance(u, v)
        if distance <= 0:
            return 0.0
        return math.degrees(
            math.atan(
                (self.get_cell(v).elevation - self.get_cell(u).elevation) / distance
            )
        )

    def get_slope(self, u: tuple[int, int], v: tuple[int, int]) -> float:
        if self.isp_model == "BRANDAO":
            return 0.0
        adjustment = self.slope_adjustments.get((u, v))
        return (
            adjustment.effective_slope_deg
            if adjustment
            else self.get_original_slope(u, v)
        )

    def _get_effective_speed(self, point: tuple[int, int]) -> float:
        opening = self.cell_openings.get(point)
        if self.is_impassable_terrain(point):
            return opening.opened_speed_mps if opening else 0.0
        speed = self.speeds[self.get_cell(point).terrain]
        return (
            min(speed, self.robot_speed_normal) if self.isp_model == "NORMAL" else speed
        )

    def get_reference_velocity(self, u: tuple[int, int], v: tuple[int, int]) -> float:
        speeds = [
            self.minimum_terrain_speed
            if self.is_impassable_terrain(node)
            else min(self.speeds[self.get_cell(node).terrain], self.robot_speed_normal)
            for node in (u, v)
        ]
        slope = self.get_original_slope(u, v)
        factor = (
            1 + max(0.0, slope / self.max_slope_deg) if self.max_slope_deg > 0 else 1.0
        )
        return 2.0 / sum(1.0 / speed for speed in speeds) / factor

    def get_velocity(
        self,
        u: tuple[int, int],
        v: tuple[int, int],
        opened_cells=frozenset(),
        slope_edges=frozenset(),
    ) -> float:
        speeds = []
        for node in (u, v):
            if self.get_cell(node).obstacle and node not in opened_cells:
                return 0.0
            speed = self._get_effective_speed(node)
            if speed <= 0 and node in opened_cells:
                speed = self.minimum_terrain_speed
            if speed <= 0:
                return 0.0
            speeds.append(speed)
        slope = self.get_slope(u, v)
        if (u, v) in slope_edges:
            slope = math.copysign(self.max_slope_deg, slope)
        if abs(slope) > self.max_slope_deg:
            return 0.0
        intervention = self.environmental_speed_edges.get(
            (u, v)
        ) or self.robot_capability_edges.get((u, v))
        if intervention:
            return intervention.target_speed_mps
        factor = (
            1 + max(0.0, slope / self.max_slope_deg) if self.max_slope_deg > 0 else 1.0
        )
        return 2.0 / sum(1.0 / speed for speed in speeds) / factor

    def is_traversable(self, u: tuple[int, int], v: tuple[int, int]) -> bool:
        return self.get_velocity(u, v) > 0

    def get_cost(
        self,
        u: tuple[int, int],
        v: tuple[int, int],
        opened_cells=frozenset(),
        slope_edges=frozenset(),
    ) -> float:
        velocity = self.get_velocity(u, v, opened_cells, slope_edges)
        return self.get_distance(u, v) / velocity if velocity > 0 else float("inf")

    def get_neighbors(
        self, u: tuple[int, int], only_traversable: bool = False
    ) -> list[tuple[int, int]]:
        i, j = u
        if self.connectivity == 8:
            directions = (
                (-1, 0),
                (1, 0),
                (0, -1),
                (0, 1),
                (-1, -1),
                (-1, 1),
                (1, -1),
                (1, 1),
            )
        else:
            directions = ((-1, 0), (1, 0), (0, -1), (0, 1))

        neighbors = []
        for di, dj in directions:
            ni, nj = i + di, j + dj
            if 0 <= ni < self.h and 0 <= nj < self.w:
                v = (ni, nj)
                if not only_traversable or self.is_traversable(u, v):
                    neighbors.append(v)
        return neighbors

    @property
    def terrain(self) -> list[list[str]]:
        return [[cell.terrain for cell in row] for row in self.cells]

    @property
    def elevation(self) -> list[list[float]]:
        return [[cell.elevation for cell in row] for row in self.cells]

    @property
    def obstacle(self) -> list[list[int]]:
        return [[cell.obstacle for cell in row] for row in self.cells]

    def load_terrain_matrix(self, matrix: list[list[str]]) -> None:
        for i in range(self.h):
            for j in range(self.w):
                self.cells[i][j].terrain = matrix[i][j]

    def load_elevation_matrix(self, matrix: list[list[float]]) -> None:
        for i in range(self.h):
            for j in range(self.w):
                self.cells[i][j].elevation = matrix[i][j]

    def load_obstacle_matrix(self, matrix: list[list[int]]) -> None:
        for i in range(self.h):
            for j in range(self.w):
                self.cells[i][j].obstacle = matrix[i][j]

    def to_dict(self) -> dict:
        return {
            "isp_model": self.isp_model,
            "h": self.h,
            "w": self.w,
            "cell_size": self.cell_size,
            "connectivity": self.connectivity,
            "max_slope_deg": self.max_slope_deg,
            "speeds": dict(self.speeds),
            "terrain": self.terrain,
            "elevation": self.elevation,
            "obstacle": self.obstacle,
            "isp_model_version": self.isp_model_version,
            "cell_openings": [
                asdict(self.cell_openings[key]) for key in sorted(self.cell_openings)
            ],
            "slope_adjustments": [
                asdict(self.slope_adjustments[key])
                for key in sorted(self.slope_adjustments)
            ],
            "environmental_speed_edges": [
                asdict(self.environmental_speed_edges[key])
                for key in sorted(self.environmental_speed_edges)
            ],
            "robot_capability_edges": [
                asdict(self.robot_capability_edges[key])
                for key in sorted(self.robot_capability_edges)
            ],
            "generation_profile": copy.deepcopy(self.generation_profile),
            "robot_speed_normal": self.robot_speed_normal,
            "robot_speed_theoretical": self.robot_speed_theoretical,
            "base_seed": self.base_seed,
            "effective_seed": self.effective_seed,
            "generation_attempt": self.generation_attempt,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Grid":
        profile = data.get("generation_profile")
        if (
            not isinstance(profile, dict)
            or profile.get("MAP_PROFILE_VERSION") != config.MAP_PROFILE_VERSION
        ):
            raise ValueError(
                f"Unsupported map profile. Generate a new map using {config.MAP_PROFILE_VERSION}."
            )
        required_fields = {
            "h",
            "w",
            "cell_size",
            "connectivity",
            "max_slope_deg",
            "speeds",
            "terrain",
            "elevation",
            "obstacle",
            "isp_model",
            "isp_model_version",
            "cell_openings",
            "slope_adjustments",
            "environmental_speed_edges",
            "robot_capability_edges",
            "robot_speed_normal",
            "generation_profile",
            "robot_speed_theoretical",
            "base_seed",
            "effective_seed",
            "generation_attempt",
        }
        missing_fields = required_fields - data.keys()
        if missing_fields:
            raise ValueError(
                f"Missing map fields: {', '.join(sorted(missing_fields))}."
            )
        unknown_fields = data.keys() - required_fields
        if unknown_fields:
            raise ValueError(
                f"Unknown map fields: {', '.join(sorted(unknown_fields))}."
            )
        if (
            type(data["h"]) is not int
            or type(data["w"]) is not int
            or data["h"] <= 0
            or data["w"] <= 0
            or data["connectivity"] not in (4, 8)
            or not math.isfinite(data["cell_size"])
            or data["cell_size"] <= 0
        ):
            raise ValueError("Invalid grid dimensions, connectivity or cell size.")
        for name in ("terrain", "elevation", "obstacle"):
            matrix = data[name]
            if len(matrix) != data["h"] or any(len(row) != data["w"] for row in matrix):
                raise ValueError(f"Invalid {name} matrix shape.")
        grid = cls(
            h=data["h"],
            w=data["w"],
            cell_size=data["cell_size"],
            connectivity=data["connectivity"],
            max_slope_deg=data["max_slope_deg"],
        )
        grid.isp_model = data["isp_model"]
        if grid.isp_model not in {"NORMAL", "BRANDAO"}:
            raise ValueError("Unknown grid ISP model.")
        grid.speeds = dict(data["speeds"])
        if any(
            terrain not in grid.speeds for row in data["terrain"] for terrain in row
        ):
            raise ValueError("Map terrain classes must exist in its speed registry.")
        if any(not math.isfinite(value) for row in data["elevation"] for value in row):
            raise ValueError("Map elevations must be finite.")
        if any(
            type(value) is not int or value < 0
            for row in data["obstacle"]
            for value in row
        ):
            raise ValueError("Map obstacles must be nonnegative integers.")
        grid.load_terrain_matrix(data["terrain"])
        grid.load_elevation_matrix(data["elevation"])
        grid.load_obstacle_matrix(data["obstacle"])
        if data["isp_model_version"] != grid.isp_model_version:
            raise ValueError("Unsupported ISP model version. Generate a new map.")
        grid.robot_speed_normal = data["robot_speed_normal"]
        grid.robot_speed_theoretical = data["robot_speed_theoretical"]
        grid.generation_profile = copy.deepcopy(profile)
        for name, record_type, key_name in (
            ("cell_openings", CellOpening, "cell"),
            ("slope_adjustments", SlopeAdjustment, "edge"),
            ("environmental_speed_edges", SpeedIntervention, "edge"),
            ("robot_capability_edges", SpeedIntervention, "edge"),
        ):
            for supplied in data[name]:
                record = record_type(**supplied)
                key = getattr(record, key_name)
                collection = getattr(grid, name)
                if key in collection:
                    raise ValueError(f"Duplicate {name} record.")
                collection[key] = record
        grid.validate_interventions()
        grid.base_seed = data["base_seed"]
        grid.effective_seed = data["effective_seed"]
        grid.generation_attempt = data["generation_attempt"]
        return grid

    def validate_interventions(self) -> None:
        if (
            self.robot_speed_normal != config.ROBOT_SPEED_NORMAL
            or self.robot_speed_theoretical != config.ROBOT_SPEED_THEORETICAL
        ):
            raise ValueError("Unsupported robot speed limits.")
        if not math.isfinite(self.max_slope_deg) or not 0 <= self.max_slope_deg <= 90:
            raise ValueError(
                "The maximum slope must be finite and within [0, 90] degrees."
            )
        if self.isp_model == "NORMAL" and self.max_slope_deg != config.MAX_SLOPE_DEG:
            raise ValueError("Unsupported normal slope limit.")
        if not self.speeds or any(
            not math.isfinite(speed) for speed in self.speeds.values()
        ):
            raise ValueError("Terrain speeds must be finite.")
        if not any(
            speed > 0 and terrain not in config.IMPASSABLE_TERRAINS
            for terrain, speed in self.speeds.items()
        ):
            raise ValueError("At least one traversable terrain speed must be positive.")
        if self.isp_model == "NORMAL" and any(
            speed > self.robot_speed_normal for speed in self.speeds.values()
        ):
            raise ValueError(
                "Normal terrain speeds cannot exceed the normal robot limit."
            )
        if self.isp_model == "BRANDAO" and any(
            (
                self.cell_openings,
                self.slope_adjustments,
                self.environmental_speed_edges,
                self.robot_capability_edges,
            )
        ):
            raise ValueError("Brandao maps cannot contain normal interventions.")
        if set(self.environmental_speed_edges) & set(self.robot_capability_edges):
            raise ValueError(
                "An edge cannot contain both speed intervention categories."
            )
        for opening in self.cell_openings.values():
            row, col = opening.cell
            if not (0 <= row < self.h and 0 <= col < self.w):
                raise ValueError("Cell opening is outside the grid.")
            cell = self.get_cell(opening.cell)
            expected_speed = (
                self.minimum_terrain_speed
                if opening.impassable_terrain
                else self.speeds[cell.terrain]
            )
            if (
                cell.obstacle
                or cell.terrain != opening.original_terrain
                or opening.impassable_terrain
                != self.is_impassable_terrain(opening.cell)
                or opening.opened_speed_mps != expected_speed
            ):
                raise ValueError("Cell opening does not match the applied map.")
        for name in (
            "slope_adjustments",
            "environmental_speed_edges",
            "robot_capability_edges",
        ):
            for record in getattr(self, name).values():
                u, v = record.edge
                if not all(
                    0 <= row < self.h and 0 <= col < self.w for row, col in (u, v)
                ) or v not in self.get_neighbors(u):
                    raise ValueError(
                        "Interventions require adjacent directed grid edges."
                    )
                if name == "slope_adjustments":
                    original = self.get_original_slope(u, v)
                    if (
                        abs(original) <= self.max_slope_deg
                        or not math.isclose(
                            record.original_slope_deg, original, abs_tol=1e-9
                        )
                        or record.effective_slope_deg
                        != math.copysign(self.max_slope_deg, original)
                    ):
                        raise ValueError("Invalid directed slope adjustment.")
                else:
                    reference = self.get_reference_velocity(u, v)
                    environmental = (
                        reference
                        < config.ROBOT_SPEED_ELIGIBILITY_RATIO * self.robot_speed_normal
                    )
                    target = (
                        self.robot_speed_normal
                        if environmental
                        else self.robot_speed_theoretical
                    )
                    if (
                        not math.isclose(
                            record.reference_speed_mps, reference, abs_tol=1e-9
                        )
                        or record.target_speed_mps != target
                        or environmental != (name == "environmental_speed_edges")
                        or not self.is_traversable(u, v)
                    ):
                        raise ValueError(
                            "Invalid speed intervention eligibility or passage conditions."
                        )

    def save(self, filepath: str | Path) -> None:
        if (
            self.generation_profile is None
            or self.generation_profile.get("MAP_PROFILE_VERSION")
            != config.MAP_PROFILE_VERSION
        ):
            raise ValueError(
                f"Only maps generated with {config.MAP_PROFILE_VERSION} can be saved."
            )
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, filepath: str | Path) -> "Grid":
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(
                f"Map file not found: '{path}'. Generate or persist a map in the current output directory."
            )

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return cls.from_dict(data)
