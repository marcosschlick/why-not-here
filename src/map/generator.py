import numpy as np

from ..config import (
    CELL_SIZE,
    CONNECTIVITY,
    DEFAULT_TERRAIN,
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
    TERRAINS,
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

    biome_order = (
        "WATER_RIVER",
        "MUD",
        "SAND",
        "DRY_VEGETATION",
        "GRASS",
        "COMPACTED_SOIL",
    )
    ordered_terrains = [
        (
            name,
            thresholds.get(name, MAP_BIOME_THRESHOLDS.get(name, 1.0)),
        )
        for name in biome_order
        if name in TERRAINS
    ]

    terrain_matrix: list[list[str]] = []
    for i in range(rows):
        row_terrain: list[str] = []
        for j in range(cols):
            b_val = biome_noise[i, j]
            chosen = DEFAULT_TERRAIN
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
    cell_size: float | None = None,
    connectivity: int = CONNECTIVITY,
    max_slope_deg: float | None = None,
    elevation_scale: float = MAP_ELEVATION_SCALE,
    elevation_freq: float = MAP_ELEVATION_FREQ,
    elevation_octaves: int = MAP_ELEVATION_OCTAVES,
    biome_freq: float | None = None,
    biome_octaves: int = MAP_BIOME_OCTAVES,
    biome_thresholds: dict[str, float] | None = None,
    obstacle_freq: float = MAP_OBSTACLE_FREQ,
    obstacle_threshold: float = MAP_OBSTACLE_THRESHOLD,
) -> Grid:
    rows = h if h is not None else (height if height is not None else MAP_H)
    cols = w if w is not None else (width if width is not None else MAP_W)
    seed_val = seed if seed is not None else MAP_DEFAULT_SEED
    cell_size_val = CELL_SIZE if cell_size is None else cell_size
    max_slope_val = MAX_SLOPE_DEG if max_slope_deg is None else max_slope_deg
    biome_freq_val = MAP_BIOME_FREQ if biome_freq is None else biome_freq
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
        freq=biome_freq_val,
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
        cell_size=cell_size_val,
        connectivity=connectivity,
        max_slope_deg=max_slope_val,
    )
    grid.load_elevation_matrix(elevation_matrix)
    grid.load_terrain_matrix(terrain_matrix)
    grid.load_obstacle_matrix(obstacle_matrix)
    return grid
