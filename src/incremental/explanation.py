from src.config import IMPASSABLE_TERRAINS
from src.grid.grid import Grid
from src.isp.semantics import SemanticModifications

TERRAIN_NAMES_PT = {
    "COMPACTED_SOIL": "solo compactado",
    "GRASS": "grama",
    "DRY_VEGETATION": "vegetação seca",
    "SAND": "areia",
    "MUD": "lama",
    "WATER_RIVER": "rio/curso d'água",
}


def generate_explanation_text(
    modifications: SemanticModifications | None,
    grid: Grid | None = None,
) -> str:
    if modifications is None:
        return "Nenhuma intervenção viável foi encontrada para tornar a rota alternativa p' ótima."

    has_terrain = bool(modifications.terrain_nodes)
    has_obstacle = bool(modifications.obstacle_nodes)
    has_slope = bool(modifications.slope_edges)

    if not has_terrain and not has_obstacle and not has_slope:
        return "A rota alternativa p' já é tão rápida quanto a rota ótima p*, não exigindo nenhuma alteração no ambiente."

    lines = [
        (
            "A rota ótima p* foi escolhida em vez da alternativa p' porque o trajeto alternativo "
            "enfrenta desvantagens no terreno que aumentam o tempo de deslocamento do robô. "
            "Para que a rota alternativa p' se tornasse tão eficiente quanto a rota ótima p*, "
            "seriam necessárias as seguintes modificações mínimas no ambiente:"
        )
    ]

    if has_terrain:
        if grid is not None:
            counts: dict[str, int] = {}
            for u in modifications.terrain_nodes:
                t = grid.get_cell(u).terrain
                name = TERRAIN_NAMES_PT.get(t, t.lower())
                counts[name] = counts.get(name, 0) + 1
            details = ", ".join(f"{cnt} de {name}" for name, cnt in counts.items())
            lines.append(
                f"- Pavimentar {len(modifications.terrain_nodes)} células de terreno lento "
                f"({details}) para o padrão de alta velocidade (asfalto)."
            )
        else:
            lines.append(
                f"- Pavimentar {len(modifications.terrain_nodes)} células com terrenos degradados "
                f"para o patamar de referência de alta velocidade (asfalto)."
            )

    if has_obstacle:
        water_count = 0
        obs_count = 0
        if grid is not None:
            for u in modifications.obstacle_nodes:
                if grid.get_cell(u).terrain in IMPASSABLE_TERRAINS:
                    water_count += 1
                else:
                    obs_count += 1
        else:
            obs_count = len(modifications.obstacle_nodes)

        if water_count > 0:
            lines.append(
                f"- Construir travessia transitável em {water_count} células de rio/curso d'água."
            )
        if obs_count > 0:
            lines.append(
                f"- Remover obstáculos intransponíveis em {obs_count} células "
                "que bloqueiam a passagem direta na rota alternativa."
            )

    if has_slope:
        lines.append(
            f"- Aplainar {len(modifications.slope_edges)} trechos de aclive/inclinação acentuada "
            "que desaceleram ou impedem a progressão contínua do robô."
        )

    lines.append(
        "Sem essas intervenções, a rota alternativa impõe maior resistência física e atrasa a missão."
    )
    return "\n".join(lines)


def generate_cost_baseline_justification(
    cost_p_star: float, cost_p_prime: float
) -> str:
    if cost_p_star == float("inf"):
        return "Nenhuma rota viável foi encontrada no mapa atual para a origem e o destino definidos."
    if cost_p_prime == float("inf"):
        return (
            f"A rota ótima p* foi escolhida por ser viável (tempo estimado: {cost_p_star:.2f} s), "
            "enquanto a rota alternativa p' é intransponível nas condições atuais do terreno "
            "(tempo infinito devido a obstáculos ou aclives excessivos)."
        )
    diff = cost_p_prime - cost_p_star
    if abs(diff) < 1e-4:
        return (
            f"A rota alternativa p' possui o mesmo tempo de percurso estimado que a rota ótima p* "
            f"({cost_p_star:.2f} s)."
        )
    pct = (diff / cost_p_star * 100.0) if cost_p_star > 0.0 else 0.0
    return (
        f"A rota ótima p* foi escolhida por ser mais rápida: tempo total estimado de {cost_p_star:.2f} s "
        f"contra {cost_p_prime:.2f} s da rota alternativa p' "
        f"(diferença de {diff:.2f} s, tornando a rota alternativa {pct:.1f}% mais lenta)."
    )
