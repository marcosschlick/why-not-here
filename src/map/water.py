import math

import numpy as np
from scipy.ndimage import label


def remove_small_water_regions(
    terrain_matrix: list[list[str]], minimum_area_ratio: float
) -> list[list[str]]:
    if not math.isfinite(minimum_area_ratio) or not 0.0 <= minimum_area_ratio <= 1.0:
        raise ValueError("Minimum water area ratio must be finite and within [0, 1].")
    if not terrain_matrix or not terrain_matrix[0]:
        return terrain_matrix
    terrain = np.asarray(terrain_matrix)
    water = terrain == "WATER_RIVER"
    if not water.any():
        return terrain_matrix
    side_neighbors = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
    components, _ = label(water, structure=side_neighbors)
    sizes = np.bincount(components.ravel())
    minimum_cells = max(4, math.ceil(minimum_area_ratio * terrain.size))
    small_regions = sizes < minimum_cells
    small_regions[0] = False
    if not small_regions.any():
        return terrain_matrix
    terrain[small_regions[components]] = "MUD"
    return terrain.tolist()
