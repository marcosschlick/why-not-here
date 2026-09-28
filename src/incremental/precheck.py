from src.config import V_MAX
from src.grid.grid import Grid


def validate_alternative_path(
    grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    alternative_path: list[tuple[int, int]],
) -> tuple[bool, str | None, str | None]:
    if (
        not alternative_path
        or alternative_path[0] != start
        or alternative_path[-1] != goal
    ):
        return (
            False,
            "INVALID_ALTERNATIVE_PATH",
            "Caminho alternativo inválido para a origem e o destino fornecidos.",
        )

    for r in range(len(alternative_path) - 1):
        u, v = alternative_path[r], alternative_path[r + 1]
        if v not in grid.get_neighbors(u):
            return (
                False,
                "INVALID_ALTERNATIVE_PATH",
                "Caminho alternativo inválido: contém saltos não adjacentes entre células.",
            )

    return True, None, None


def check_geometric_feasibility(
    grid: Grid,
    alternative_path: list[tuple[int, int]],
    cost_p_star: float,
    tolerance: float,
) -> tuple[bool, str | None, str | None]:
    if cost_p_star != float("inf") and len(alternative_path) >= 2:
        t_min_prime = sum(
            grid.get_distance(alternative_path[r], alternative_path[r + 1]) / V_MAX
            for r in range(len(alternative_path) - 1)
        )
        if t_min_prime > cost_p_star + tolerance:
            return (
                False,
                "GEOMETRICALLY_INFEASIBLE",
                "Geometricamente inviável: a rota alternativa é longa demais mesmo à velocidade máxima teórica do ambiente.",
            )

    return True, None, None
