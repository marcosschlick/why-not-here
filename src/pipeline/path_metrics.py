from itertools import pairwise
from math import hypot

import numpy as np
from scipy.spatial import cKDTree


def measure_paths(
    optimal_path: list[tuple[int, int]],
    alternative_path: list[tuple[int, int]],
    cell_size: float,
) -> dict[str, float | int]:
    def length(path: list[tuple[int, int]]) -> float:
        return sum(hypot(v[0] - u[0], v[1] - u[1]) for u, v in pairwise(path))

    optimal = np.asarray(optimal_path, dtype=float)
    alternative = np.asarray(alternative_path, dtype=float)
    hausdorff = max(
        float(cKDTree(optimal).query(alternative)[0].max()),
        float(cKDTree(alternative).query(optimal)[0].max()),
    )
    optimal_length = length(optimal_path)
    alternative_length = length(alternative_path)
    return {
        "cell_size_m": cell_size,
        "optimal_points": len(optimal_path),
        "optimal_edges": max(0, len(optimal_path) - 1),
        "alternative_points": len(alternative_path),
        "alternative_edges": max(0, len(alternative_path) - 1),
        "optimal_length_cells": optimal_length,
        "optimal_length_m": optimal_length * cell_size,
        "alternative_length_cells": alternative_length,
        "alternative_length_m": alternative_length * cell_size,
        "hausdorff_cells": hausdorff,
        "hausdorff_m": hausdorff * cell_size,
    }
