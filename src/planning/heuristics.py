import math

from ..config import CELL_SIZE, V_MAX


def euclidean_time_heuristic(
    u: tuple[int, int],
    v: tuple[int, int],
    cell_size: float = CELL_SIZE,
    v_max: float = V_MAX,
) -> float:
    return (math.hypot(u[0] - v[0], u[1] - v[1]) * cell_size) / v_max
