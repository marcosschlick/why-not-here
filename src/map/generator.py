import numpy as np

from ..config import (
    CELL_SIZE,
    CONNECTIVITY,
    IMPASSABLE_TERRAINS,
    MAP_BIOME_FREQ,
    MAP_BIOME_OCTAVES,
    MAP_BIOME_THRESHOLDS,
    MAP_DEFAULT_SEED,
    MAP_ELEVATION_FREQ,
    MAP_ELEVATION_OCTAVES,
    MAP_ELEVATION_SCALE,
    MAP_H,
    MAP_OBSTACLE_FREQ,
    MAP_OBSTACLE_THRESHOLD,
    MAP_W,
    MAX_SLOPE_DEG,
)
from ..grid import Grid
from .noise import perlin_noise_2d


def _generate_elevation(
    rows: int,
    cols: int,
    seed: int,
    freq: float,
    octaves: int,
    scale: float,
) -> list[list[float]]:
    raw_noise = perlin_noise_2d(
        h=rows,
        w=cols,
        freq=freq,
        seed=seed,
        octaves=octaves,
    )
    return (raw_noise * scale).tolist()


def _generate_terrain(
    rows: int,
    cols: int,
    seed: int,
    freq: float,
    octaves: int,
    thresholds: dict[str, float],
) -> list[list[str]]:
    biome_noise = perlin_noise_2d(
        h=rows,
        w=cols,
        freq=freq,
        seed=seed + 101,
        octaves=octaves,
    )

    ordered_terrains = [
        (
            "WATER_RIVER",
            thresholds.get("WATER_RIVER", MAP_BIOME_THRESHOLDS["WATER_RIVER"]),
        ),
        ("MUD", thresholds.get("MUD", MAP_BIOME_THRESHOLDS["MUD"])),
        ("SAND", thresholds.get("SAND", MAP_BIOME_THRESHOLDS["SAND"])),
        (
            "DRY_VEGETATION",
            thresholds.get("DRY_VEGETATION", MAP_BIOME_THRESHOLDS["DRY_VEGETATION"]),
        ),
        ("GRASS", thresholds.get("GRASS", MAP_BIOME_THRESHOLDS["GRASS"])),
        (
            "COMPACTED_SOIL",
            thresholds.get("COMPACTED_SOIL", MAP_BIOME_THRESHOLDS["COMPACTED_SOIL"]),
        ),
    ]

    terrain_matrix: list[list[str]] = []
    for i in range(rows):
        row_terrain: list[str] = []
        for j in range(cols):
            b_val = biome_noise[i, j]
            chosen = "GRASS"
            for t_name, th in ordered_terrains:
                if b_val <= th:
                    chosen = t_name
                    break
            row_terrain.append(chosen)
        terrain_matrix.append(row_terrain)
    return terrain_matrix


def _generate_obstacles(
    rows: int,
    cols: int,
    seed: int,
    freq: float,
    threshold: float,
    terrain_matrix: list[list[str]],
) -> list[list[int]]:
    obstacle_noise = perlin_noise_2d(
        h=rows,
        w=cols,
        freq=freq,
        seed=seed + 202,
        octaves=2,
    )
    obstacle_matrix: list[list[int]] = (
        (obstacle_noise >= threshold).astype(np.int64).tolist()
    )
    for i in range(rows):
        for j in range(cols):
            if terrain_matrix[i][j] in IMPASSABLE_TERRAINS:
                obstacle_matrix[i][j] = 1
    return obstacle_matrix


def generate_map(
    h: int | None = None,
    w: int | None = None,
    seed: int | None = None,
    *,
    width: int | None = None,
    height: int | None = None,
    cell_size: float = CELL_SIZE,
    connectivity: int = CONNECTIVITY,
    max_slope_deg: float = MAX_SLOPE_DEG,
    elevation_scale: float = MAP_ELEVATION_SCALE,
    elevation_freq: float = MAP_ELEVATION_FREQ,
    elevation_octaves: int = MAP_ELEVATION_OCTAVES,
    biome_freq: float = MAP_BIOME_FREQ,
    biome_octaves: int = MAP_BIOME_OCTAVES,
    biome_thresholds: dict[str, float] | None = None,
    obstacle_freq: float = MAP_OBSTACLE_FREQ,
    obstacle_threshold: float = MAP_OBSTACLE_THRESHOLD,
) -> Grid:
    rows = h if h is not None else (height if height is not None else MAP_H)
    cols = w if w is not None else (width if width is not None else MAP_W)
    seed_val = seed if seed is not None else MAP_DEFAULT_SEED
    thresholds = (
        biome_thresholds if biome_thresholds is not None else MAP_BIOME_THRESHOLDS
    )

    elevation_matrix = _generate_elevation(
        rows=rows,
        cols=cols,
        seed=seed_val,
        freq=elevation_freq,
        octaves=elevation_octaves,
        scale=elevation_scale,
    )
    terrain_matrix = _generate_terrain(
        rows=rows,
        cols=cols,
        seed=seed_val,
        freq=biome_freq,
        octaves=biome_octaves,
        thresholds=thresholds,
    )
    obstacle_matrix = _generate_obstacles(
        rows=rows,
        cols=cols,
        seed=seed_val,
        freq=obstacle_freq,
        threshold=obstacle_threshold,
        terrain_matrix=terrain_matrix,
    )

    grid = Grid(
        h=rows,
        w=cols,
        cell_size=cell_size,
        connectivity=connectivity,
        max_slope_deg=max_slope_deg,
    )
    grid.load_elevation_matrix(elevation_matrix)
    grid.load_terrain_matrix(terrain_matrix)
    grid.load_obstacle_matrix(obstacle_matrix)
    return grid
