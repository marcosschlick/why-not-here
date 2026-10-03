import numpy as np

from .noise import perlin_noise_2d


def generate_roughness_field(
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


def generate_obstacle_matrix(
    roughness_field: np.ndarray,
    terrain_matrix: list[list[str]],
    thresholds: dict[str, float],
    impassable_terrains: set[str],
) -> list[list[int]]:
    height, width = roughness_field.shape
    obstacle_matrix: list[list[int]] = []
    for row in range(height):
        obstacle_row: list[int] = []
        for col in range(width):
            terrain = terrain_matrix[row][col]
            threshold = thresholds.get(terrain)
            has_obstacle = (
                terrain != "WATER_RIVER"
                and terrain not in impassable_terrains
                and threshold is not None
                and roughness_field[row, col] >= threshold
            )
            obstacle_row.append(int(has_obstacle))
        obstacle_matrix.append(obstacle_row)
    return obstacle_matrix
