import numpy as np

from .noise import perlin_noise_2d


def generate_moisture_field(
    height: int,
    width: int,
    seed: int,
    frequency: float,
    octaves: int,
) -> np.ndarray:
    return perlin_noise_2d(
        h=height,
        w=width,
        freq=frequency,
        seed=seed,
        octaves=octaves,
    )


def _classify_terrain(
    elevation: float,
    moisture: float,
    thresholds: dict[str, float],
) -> str:
    lowland_max = thresholds["LOWLAND_ELEVATION_MAX"]
    if elevation < lowland_max:
        if moisture >= thresholds["WATER_MOISTURE_MIN"]:
            return "WATER_RIVER"
        if moisture >= thresholds["MUD_MOISTURE_MIN"]:
            return "MUD"
        return "SAND"

    if (
        elevation >= thresholds["ROCKY_ELEVATION_MIN"]
        and moisture < thresholds["ROCKY_MOISTURE_MAX"]
    ):
        return "ROCKY"
    if moisture >= thresholds["FOREST_MOISTURE_MIN"]:
        return "FOREST"
    if moisture < thresholds["DRY_MOISTURE_MAX"]:
        return "DRY_VEGETATION"
    if elevation >= thresholds["GRASSLAND_ELEVATION_MIN"]:
        return "GRASSLAND"
    return "GRASS"


def classify_terrain_matrix(
    elevation_field: np.ndarray,
    moisture_field: np.ndarray,
    thresholds: dict[str, float],
    available_terrains: set[str],
    default_terrain: str,
) -> list[list[str]]:
    height, width = elevation_field.shape
    terrain_matrix: list[list[str]] = []
    for row in range(height):
        terrain_row: list[str] = []
        for col in range(width):
            terrain = _classify_terrain(
                float(elevation_field[row, col]),
                float(moisture_field[row, col]),
                thresholds,
            )
            terrain_row.append(
                terrain if terrain in available_terrains else default_terrain
            )
        terrain_matrix.append(terrain_row)
    return terrain_matrix
