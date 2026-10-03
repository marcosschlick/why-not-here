import json
import math
from pathlib import Path

from .. import config
from ..config import (
    CONNECTIVITY,
    MAP_H,
    MAP_W,
)
from .cell import Cell


class Grid:
    def __init__(
        self,
        h: int = MAP_H,
        w: int = MAP_W,
        cell_size: float | None = None,
        connectivity: int = CONNECTIVITY,
        max_slope_deg: float | None = None,
    ) -> None:
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

        self.leveled_slopes: set[tuple[tuple[int, int], tuple[int, int]]] = set()
        self.base_seed: int | None = None
        self.effective_seed: int | None = None
        self.generation_attempt: int | None = None

    def get_cell(self, u: tuple[int, int]) -> Cell:
        return self.cells[u[0]][u[1]]

    def get_distance(self, u: tuple[int, int], v: tuple[int, int]) -> float:
        return math.hypot(v[0] - u[0], v[1] - u[1]) * self.cell_size

    def get_slope(self, u: tuple[int, int], v: tuple[int, int]) -> float:
        if (u, v) in self.leveled_slopes or (v, u) in self.leveled_slopes:
            return 0.0

        d_uv = self.get_distance(u, v)
        if d_uv <= 0.0:
            return 0.0

        delta_z = self.get_cell(v).elevation - self.get_cell(u).elevation
        return math.degrees(math.atan(delta_z / d_uv))

    def is_traversable(self, u: tuple[int, int], v: tuple[int, int]) -> bool:
        if self.get_cell(u).is_blocked or self.get_cell(v).is_blocked:
            return False

        if abs(self.get_slope(u, v)) > self.max_slope_deg:
            return False

        return self.get_velocity(u, v) > 0.0

    def get_velocity(self, u: tuple[int, int], v: tuple[int, int]) -> float:
        v_u = self.speeds.get(self.get_cell(u).terrain, 0.0)
        v_v = self.speeds.get(self.get_cell(v).terrain, 0.0)
        if v_u <= 0.0 or v_v <= 0.0:
            return 0.0
        return 2.0 / ((1.0 / v_u) + (1.0 / v_v))

    def get_slope_penalty(self, u: tuple[int, int], v: tuple[int, int]) -> float:
        slope = self.get_slope(u, v)
        if slope > 0.0 and self.max_slope_deg > 0.0:
            return slope / self.max_slope_deg
        return 0.0

    def get_cost(self, u: tuple[int, int], v: tuple[int, int]) -> float:
        if not self.is_traversable(u, v):
            return float("inf")
        vel = self.get_velocity(u, v)
        if vel <= 0.0:
            return float("inf")
        base_cost = self.get_distance(u, v) / vel
        slope_factor = 1.0 + self.get_slope_penalty(u, v)
        return base_cost * slope_factor

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
            "h": self.h,
            "w": self.w,
            "cell_size": self.cell_size,
            "connectivity": self.connectivity,
            "max_slope_deg": self.max_slope_deg,
            "speeds": self.speeds,
            "terrain": self.terrain,
            "elevation": self.elevation,
            "obstacle": self.obstacle,
            "leveled_slopes": [list(edge) for edge in self.leveled_slopes],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Grid":
        grid = cls(
            h=data["h"],
            w=data["w"],
            cell_size=data["cell_size"],
            connectivity=data["connectivity"],
            max_slope_deg=data["max_slope_deg"],
        )
        grid.speeds = data["speeds"]
        grid.load_terrain_matrix(data["terrain"])
        grid.load_elevation_matrix(data["elevation"])
        grid.load_obstacle_matrix(data["obstacle"])
        grid.leveled_slopes = {
            (tuple(e[0]), tuple(e[1])) for e in data["leveled_slopes"]
        }
        return grid

    def save(self, filepath: str | Path) -> None:
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, filepath: str | Path) -> "Grid":
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(
                f"Map file not found: '{path}'. Please add a map to 'maps/' or generate one using Option 1 or 3."
            )

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return cls.from_dict(data)
