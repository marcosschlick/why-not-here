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

    for node in alternative_path:
        if not (0 <= node[0] < grid.h and 0 <= node[1] < grid.w):
            return (
                False,
                "INVALID_ALTERNATIVE_PATH",
                "Caminho alternativo inválido: contém nós fora dos limites da grade.",
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
    v_max = max(grid.speeds.values()) if (grid.speeds and len(grid.speeds) > 0) else V_MAX
    if cost_p_star != float("inf") and len(alternative_path) >= 2:
        path_dist = sum(
            grid.get_distance(alternative_path[r], alternative_path[r + 1])
            for r in range(len(alternative_path) - 1)
        )
        t_min_prime = path_dist / v_max
        if t_min_prime > cost_p_star + tolerance:
            diff_pct = (
                ((t_min_prime - cost_p_star) / cost_p_star * 100.0)
                if cost_p_star > 0.0
                else 0.0
            )
            msg = (
                f"A rota alternativa é fisicamente longa demais ({path_dist:.1f} m). "
                f"Mesmo à velocidade máxima teórica do mapa ({v_max:.1f} m/s) e em terreno plano, "
                f"seu tempo mínimo seria de {t_min_prime:.2f} s, superando o tempo da rota ótima ({cost_p_star:.2f} s) "
                f"em {diff_pct:.1f}%."
            )
            return (
                False,
                "GEOMETRICALLY_INFEASIBLE",
                msg,
            )

    return True, None, None
