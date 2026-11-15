import math
import re
from itertools import pairwise

from src.grid.grid import Grid
from src.isp.types import SemanticModifications

PRECHECK_MESSAGES = {
    "The alternative path does not match the supplied start and goal.": "A rota alternativa não corresponde ao início e ao destino informados.",
    "The alternative path contains nodes outside the grid.": "A rota alternativa contém células fora da grade.",
    "The alternative path contains repeated nodes.": "A rota alternativa contém células repetidas.",
    "The alternative path contains non-adjacent nodes.": "A rota alternativa contém células não adjacentes.",
}


def precheck_presentation(message: str) -> str | None:
    if message in PRECHECK_MESSAGES:
        return PRECHECK_MESSAGES[message]
    match = re.fullmatch(
        r"Endpoint \((-?\d+), (-?\d+)\) is blocked and cannot be modified\.",
        message,
    )
    if match:
        return (
            f"O ponto extremo ({match.group(1)}, {match.group(2)}) está bloqueado "
            "e não pode ser modificado."
        )
    return None


def presentation_text(language: str, english: str, portuguese: str) -> str:
    return portuguese if language == "pt-BR" else english


def presentation_number(value: float, decimals: int, language: str) -> str:
    formatted = f"{value:.{decimals}f}"
    return formatted.replace(".", ",") if language == "pt-BR" else formatted


TERRAIN_NAMES = {
    "COMPACTED_SOIL": ("compacted soil", "solo compactado"),
    "GRASSLAND": ("grassland", "campo"),
    "GRASS": ("grass", "grama"),
    "UNPAVED_TRACK": ("unpaved track", "estrada não pavimentada"),
    "DRY_VEGETATION": ("dry vegetation", "vegetação seca"),
    "SAND": ("sand", "areia"),
    "FOREST": ("forest", "floresta"),
    "MUD": ("mud", "lama"),
    "ROCKY": ("rocky terrain", "terreno rochoso"),
    "WATER_RIVER": ("river water", "água de rio"),
    "DENSE_FOREST": ("dense forest", "floresta densa"),
}


def terrain_names(names: set[str], language: str) -> str:
    known = [
        TERRAIN_NAMES[name][language == "pt-BR"]
        for name in sorted(names)
        if name in TERRAIN_NAMES
    ]
    if any(name not in TERRAIN_NAMES for name in names):
        known.append(
            presentation_text(language, "other terrain", "outro tipo de terreno")
        )
    return ", ".join(known)


def generate_explanation_text(
    modifications: SemanticModifications | None,
    grid: Grid | None = None,
    solver_status: str = "CANDIDATE_UNVALIDATED",
    stop_reason: str | None = None,
    objective_certified: bool = False,
    original_optimal_available: bool = True,
    language: str = "en",
    alternative_path=None,
    original_optimal_path=None,
    original_optimal_cost: float | None = None,
    original_alternative_cost: float | None = None,
    tolerance: float = 0.0001,
    preparation: dict | None = None,
    deadline_exceeded: bool = False,
    candidate_from_solver_limit: bool = False,
) -> str:
    def text(en: str, pt: str) -> str:
        return presentation_text(language, en, pt)

    if stop_reason == "COST_MODEL_MISMATCH":
        return text(
            "The calculated costs do not match the candidate map. The result cannot be accepted or certified.",
            "Os custos calculados não correspondem ao mapa candidato. O resultado não pode ser aceito nem certificado.",
        )
    if modifications is None:

        def no_candidate(en: str, pt: str) -> str:
            result = text(en, pt)
            if not original_optimal_available:
                return (
                    text(
                        "No route was available under the original conditions of this model. ",
                        "Nenhuma rota estava disponível nas condições originais deste modelo. ",
                    )
                    + result
                )
            return result

        reason = stop_reason or solver_status
        if reason in {"INFEASIBLE", "BLOCKED_ENDPOINT"}:
            return no_candidate(
                "No solution was found because the problem is infeasible within the allowed changes.",
                "Não foi encontrada solução porque o problema é inviável dentro das alterações permitidas.",
            )
        if reason in {
            "TIME_BUDGET_EXHAUSTED",
            "TIME_LIMIT",
            "SOLVER_LIMIT",
            "INTERRUPTED",
        }:
            return no_candidate(
                "The calculation stopped at a time or solver limit before finding a usable scenario. It is unknown whether a solution exists.",
                "O cálculo parou por limite de tempo ou do solver antes de encontrar um cenário utilizável. Não se sabe se existe solução.",
            )
        if reason in {
            "ERROR",
            "REQUEST_ERROR",
            "SOLVER_ERROR",
            "SOLVER_NOT_FOUND",
            "SOLVER_FAILED",
            "INCONSISTENT_COMPETING_PATH",
        }:
            return no_candidate(
                "The calculation failed before finding a usable scenario. See the recorded error.",
                "O cálculo falhou antes de encontrar um cenário utilizável. Consulte o erro registrado.",
            )
        return no_candidate(
            "No usable scenario was found. This does not show that the problem is infeasible.",
            "Não foi encontrado um cenário utilizável. Isso não demonstra que o problema seja inviável.",
        )

    path = [tuple(node) for node in (alternative_path or [])]
    nodes = set(path)
    edges = set(pairwise(path))
    lines = []
    brandao = modifications.model == "BRANDAO"
    if brandao:
        lines.append(
            text(
                "This comparison uses a prepared map with fast and slow terrain classes.",
                "Esta comparação usa um mapa preparado com classes de terreno rápido e lento.",
            )
        )
        converted = (preparation or {}).get("converted_blocked_cells", 0)
        if converted:
            lines.append(
                text(
                    "Before the calculation, blocked locations on the alternative route were made traversable and classified as slow terrain; these preparation changes are not charged to the objective.",
                    "Antes do cálculo, locais bloqueados na rota alternativa foram tornados transitáveis e classificados como terreno lento; essas alterações de preparação não são cobradas no objetivo.",
                )
            )
    if not original_optimal_available:
        lines.append(
            text(
                "No route was available under the original conditions of this model.",
                "Nenhuma rota estava disponível nas condições originais deste modelo.",
            )
        )
    elif original_optimal_cost is not None and original_alternative_cost is not None:
        if math.isinf(original_alternative_cost):
            lines.append(
                text(
                    "Under the original conditions, the alternative route cannot be traversed, while the selected route can.",
                    "Nas condições originais, a rota alternativa não pode ser percorrida, enquanto a rota escolhida pode.",
                )
            )
        elif math.isfinite(original_optimal_cost) and math.isfinite(
            original_alternative_cost
        ):
            if abs(original_alternative_cost - original_optimal_cost) <= tolerance:
                lines.append(
                    text(
                        "Under the original conditions, the alternative route is as fast as the selected route within the allowed tolerance; either may be chosen.",
                        "Nas condições originais, a rota alternativa é tão rápida quanto a rota escolhida dentro da tolerância permitida; qualquer uma pode ser escolhida.",
                    )
                )
            elif original_alternative_cost > original_optimal_cost:
                lines.append(
                    text(
                        "Under the original conditions, the selected route is faster than the alternative.",
                        "Nas condições originais, a rota escolhida é mais rápida que a alternativa.",
                    )
                )

    if grid is not None and path and not brandao:
        blocked = [
            grid.get_cell(node) for node in path if not grid.is_cell_traversable(node)
        ]
        obstacles = any(cell.obstacle for cell in blocked)
        names = {
            cell.terrain
            for node in path
            if grid.is_impassable_terrain(node) and node not in grid.cell_openings
            for cell in [grid.get_cell(node)]
        }
        if obstacles:
            lines.append(
                text(
                    "The alternative route encounters obstacles.",
                    "A rota alternativa encontra obstáculos.",
                )
            )
        if names:
            listed = terrain_names(names, language)
            lines.append(
                text(
                    f"The alternative route crosses terrain the robot cannot traverse: {listed}.",
                    f"A rota alternativa passa por terreno que o robô não consegue atravessar: {listed}.",
                )
            )
        if any(abs(grid.get_slope(u, v)) > grid.max_slope_deg for u, v in edges):
            lines.append(
                text(
                    "The alternative route includes a slope beyond the robot's limit.",
                    "A rota alternativa inclui uma inclinação acima do limite do robô.",
                )
            )

    validated = solver_status == "PATH_VALIDATED"
    lines.append(
        text(
            "In the calculated hypothetical scenario:",
            "No cenário hipotético calculado:",
        )
        if validated
        else text(
            "The following hypothetical changes are a candidate, not yet globally validated:",
            "As alterações hipotéticas a seguir são um candidato ainda não validado globalmente:",
        )
    )
    changes = []
    if brandao:
        for target, en, pt in (
            (
                "GRASS",
                "slow terrain would become fast",
                "terreno lento se tornaria rápido",
            ),
            (
                "FOREST",
                "fast terrain would become slow",
                "terreno rápido se tornaria lento",
            ),
        ):
            assigned = [
                tuple(node)
                for node, value in modifications.terrain_assignments
                if value == target
            ]
            if assigned:
                on = sum(node in nodes for node in assigned) if path else 0
                off = len(assigned) - on
                if on:
                    changes.append(
                        text(
                            f"On the alternative route, {en} ({on} {'cell' if on == 1 else 'cells'}).",
                            f"Na rota alternativa, {pt} ({on} {'célula' if on == 1 else 'células'}).",
                        )
                    )
                if off:
                    where_en = (
                        "Outside the alternative route, "
                        if path
                        else "In the prepared map, "
                    )
                    where_pt = (
                        "Fora da rota alternativa, " if path else "No mapa preparado, "
                    )
                    changes.append(
                        text(
                            f"{where_en}{en} ({off} {'cell' if off == 1 else 'cells'}).",
                            f"{where_pt}{pt} ({off} {'célula' if off == 1 else 'células'}).",
                        )
                    )
        selected_nodes = {tuple(node) for node in (original_optimal_path or [])}
        if any(
            tuple(node) in selected_nodes and target == "FOREST"
            for node, target in modifications.terrain_assignments
        ):
            changes.append(
                text(
                    "This includes slower terrain on the originally selected route.",
                    "Isso inclui terreno mais lento na rota originalmente escolhida.",
                )
            )
    else:
        openings = modifications.cell_openings
        if openings:
            names = {r.original_terrain for r in openings if r.impassable_terrain}
            causes_en = []
            causes_pt = []
            if any(r.original_obstacle for r in openings):
                causes_en.append("obstacles")
                causes_pt.append("obstáculos")
            if names:
                causes_en.append(
                    "impassable terrain (" + terrain_names(names, "en") + ")"
                )
                causes_pt.append(
                    "terreno intransponível (" + terrain_names(names, "pt-BR") + ")"
                )
            changes.append(
                text(
                    f"Blocked locations involving {' and '.join(causes_en)} would become traversable.",
                    f"Locais bloqueados por {' e '.join(causes_pt)} se tornariam transitáveis.",
                )
            )
        if modifications.slope_adjustments:
            changes.append(
                text(
                    "Some slopes would be adjusted to allow passage.",
                    "Algumas inclinações seriam ajustadas para permitir a passagem.",
                )
            )
        if modifications.environmental_speed_edges:
            changes.append(
                text(
                    "Environmental conditions on some segments would allow faster travel.",
                    "As condições ambientais em alguns trechos permitiriam um deslocamento mais rápido.",
                )
            )
            if grid is not None:
                affected_terrains = {
                    grid.get_cell(node).terrain
                    for record in modifications.environmental_speed_edges
                    for node in record.edge
                }
                if affected_terrains:
                    listed = terrain_names(affected_terrains, language)
                    changes.append(
                        text(
                            f"Those segments include {listed}.",
                            f"Esses trechos incluem {listed}.",
                        )
                    )
        if modifications.robot_capability_edges:
            changes.append(
                text(
                    "The robot would hypothetically be capable of higher speeds on some segments.",
                    "O robô teria, hipoteticamente, capacidade de atingir velocidades maiores em alguns trechos.",
                )
            )
        if path and (
            any(r.cell not in nodes for r in openings)
            or any(
                r.edge not in edges
                for group in (
                    modifications.slope_adjustments,
                    modifications.environmental_speed_edges,
                    modifications.robot_capability_edges,
                )
                for r in group
            )
        ):
            changes.append(
                text(
                    "Some changes affect locations or directed segments outside the alternative route.",
                    "Algumas alterações afetam locais ou trechos direcionais fora da rota alternativa.",
                )
            )
    lines.extend(
        changes or [text("No changes are proposed.", "Nenhuma alteração é proposta.")]
    )
    if validated:
        if changes:
            lines.append(
                text(
                    "Together, these changes make the alternative globally optimal within the allowed tolerance; other routes may tie.",
                    "Em conjunto, essas alterações tornam a rota alternativa globalmente ótima dentro da tolerância permitida; outras rotas podem empatar.",
                )
            )
        else:
            lines.append(
                text(
                    "Without changes, the alternative is globally optimal within the allowed tolerance; other routes may tie.",
                    "Sem alterações, a alternativa é globalmente ótima dentro da tolerância permitida; outras rotas podem empatar.",
                )
            )
    elif stop_reason == "SUBGRAPH_OPTIMAL_ONLY":
        lines.append(
            text(
                "The alternative passed the reduced-map check but not the full-map check.",
                "A alternativa passou na verificação do mapa reduzido, mas não na verificação do mapa completo.",
            )
        )
    else:
        lines.append(
            text(
                "The alternative has not passed the full-map check, so these changes may not be sufficient.",
                "A alternativa não passou na verificação do mapa completo; portanto, essas alterações podem não ser suficientes.",
            )
        )
    if stop_reason in {
        "TIME_BUDGET_EXHAUSTED",
        "TIME_LIMIT",
        "SOLVER_LIMIT",
        "INTERRUPTED",
    }:
        lines.append(
            text(
                "The calculation stopped at a time or solver limit.",
                "O cálculo parou por limite de tempo ou do solver.",
            )
        )
    if stop_reason in {
        "ERROR",
        "REQUEST_ERROR",
        "SOLVER_ERROR",
        "SOLVER_NOT_FOUND",
        "SOLVER_FAILED",
        "INCONSISTENT_COMPETING_PATH",
    }:
        lines.append(
            text(
                "The calculation ended with an error. See the recorded error.",
                "O cálculo terminou com erro. Consulte o erro registrado.",
            )
        )
    if deadline_exceeded and stop_reason != "TIME_BUDGET_EXHAUSTED":
        lines.append(
            text(
                "The calculation exceeded its time budget.",
                "O cálculo ultrapassou o limite de tempo previsto.",
            )
        )
    if candidate_from_solver_limit and stop_reason not in {
        "TIME_BUDGET_EXHAUSTED",
        "TIME_LIMIT",
        "SOLVER_LIMIT",
        "INTERRUPTED",
    }:
        lines.append(
            text(
                "The solver reached a limit while producing the candidate.",
                "O solver atingiu um limite ao produzir o candidato.",
            )
        )
    if objective_certified:
        lines.append(
            text(
                "The minimum weighted cost of changes is certified within the allowed domain."
                if brandao
                else "The minimum number of changes is certified within the allowed domain.",
                "O custo ponderado mínimo das alterações é certificado no domínio permitido."
                if brandao
                else "A quantidade mínima de alterações é certificada no domínio permitido.",
            )
        )
    else:
        lines.append(
            text(
                "A minimum cost of changes has not been certified."
                if brandao
                else "A minimum number of changes has not been certified.",
                "Não há certificação de custo mínimo das alterações."
                if brandao
                else "Não há certificação de quantidade mínima de alterações.",
            )
        )
    return "\n".join(lines)


def generate_cost_baseline_justification(
    cost_p_star: float, cost_p_prime: float, language: str = "en"
) -> str:
    if cost_p_star == float("inf"):
        return presentation_text(
            language,
            "No feasible route was found on the current map for the selected start and goal.",
            "Nenhuma rota viável foi encontrada no mapa atual entre o início e o destino selecionados.",
        )
    if cost_p_prime == float("inf"):
        english = (
            f"The optimal route p* is feasible (estimated traversal time: {cost_p_star:.2f} s), "
            "while the alternative route p' is impassable under current terrain conditions "
            "(infinite traversal time due to impassable terrain, obstacles, or steep slopes)."
        )
        portuguese = (
            f"A rota ótima p* é viável (tempo estimado de percurso: {presentation_number(cost_p_star, 2, language)} s), "
            "enquanto a rota alternativa p' é intransponível nas condições atuais do terreno "
            "(tempo de percurso infinito devido a terreno intransponível, obstáculos ou inclinações acentuadas)."
        )
        return presentation_text(language, english, portuguese)
    diff = cost_p_prime - cost_p_star
    if abs(diff) < 1e-4:
        english = (
            f"The alternative route p' has the same estimated traversal time as the optimal route p* "
            f"({cost_p_star:.2f} s)."
        )
        portuguese = (
            "A rota alternativa p' tem o mesmo tempo estimado de percurso que a rota ótima p* "
            f"({presentation_number(cost_p_star, 2, language)} s)."
        )
        return presentation_text(language, english, portuguese)
    pct = (diff / cost_p_star * 100.0) if cost_p_star > 0.0 else 0.0
    english = (
        f"The optimal route p* was selected because it is faster: estimated traversal time of {cost_p_star:.2f} s "
        f"compared with {cost_p_prime:.2f} s for the alternative route p' "
        f"(a difference of {diff:.2f} s, making the alternative route {pct:.1f}% slower)."
    )
    portuguese = (
        "A rota ótima p* foi escolhida porque é mais rápida: tempo estimado de percurso de "
        f"{presentation_number(cost_p_star, 2, language)} s, comparado com "
        f"{presentation_number(cost_p_prime, 2, language)} s da rota alternativa p' "
        f"(diferença de {presentation_number(diff, 2, language)} s; a rota alternativa é "
        f"{presentation_number(pct, 1, language)}% mais lenta)."
    )
    return presentation_text(language, english, portuguese)
