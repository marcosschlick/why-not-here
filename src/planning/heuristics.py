import math

from .. import config


def euclidean_time_heuristic(
    u: tuple[int, int],
    v: tuple[int, int],
    cell_size: float | None = None,
    v_max: float | None = None,
) -> float:
    cell_size = config.CELL_SIZE if cell_size is None else cell_size
    v_max = config.V_MAX if v_max is None else v_max
    return (math.hypot(u[0] - v[0], u[1] - v[1]) * cell_size) / v_max
