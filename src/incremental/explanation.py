from src.grid.grid import Grid
from src.isp.types import SemanticModifications


def presentation_text(language: str, english: str, portuguese: str) -> str:
    return portuguese if language == "pt-BR" else english


def presentation_number(value: float, decimals: int, language: str) -> str:
    formatted = f"{value:.{decimals}f}"
    return formatted.replace(".", ",") if language == "pt-BR" else formatted


def generate_explanation_text(
    modifications: SemanticModifications | None,
    grid: Grid | None = None,
    solver_status: str = "CANDIDATE_UNVALIDATED",
    stop_reason: str | None = None,
    objective_cost: int | None = None,
    objective_certified: bool = False,
    original_optimal_available: bool = True,
    language: str = "en",
) -> str:
    if stop_reason == "COST_MODEL_MISMATCH":
        english = (
            "Execution error: modeled edge costs differ from the costs applied to the candidate map. "
            "Physical validation is recorded separately; this execution is not successful or certified."
        )
        portuguese = (
            "Erro de execução: os custos modelados das arestas diferem dos custos aplicados ao mapa candidato. "
            "A validação física é registrada separadamente; esta execução não teve sucesso nem certificação."
        )
        return presentation_text(language, english, portuguese)
    if modifications is None:
        reason = stop_reason or solver_status
        if reason == "INFEASIBLE":
            return presentation_text(
                language,
                "The current formulation is infeasible within the declared intervention domain. No candidate explanation is available.",
                "A formulação atual é inviável no domínio de intervenções declarado. Não há explicação candidata disponível.",
            )
        if reason in {
            "TIME_BUDGET_EXHAUSTED",
            "TIME_LIMIT",
            "SOLVER_LIMIT",
            "INTERRUPTED",
        }:
            return presentation_text(
                language,
                "The execution stopped at a time or solver limit before a usable candidate was available. Feasibility remains undetermined.",
                "A execução parou por limite de tempo ou do solver antes de obter um candidato utilizável. A viabilidade permanece indeterminada.",
            )
        if reason in {
            "ERROR",
            "REQUEST_ERROR",
            "SOLVER_ERROR",
            "SOLVER_NOT_FOUND",
            "SOLVER_FAILED",
            "INCONSISTENT_COMPETING_PATH",
        }:
            return presentation_text(
                language,
                "The execution failed before a usable candidate was available. See the recorded execution error.",
                "A execução falhou antes de obter um candidato utilizável. Consulte o erro de execução apresentado.",
            )
        return presentation_text(
            language,
            "No usable candidate was returned. This inconclusive result does not establish infeasibility.",
            "Nenhum candidato utilizável foi retornado. Este resultado inconclusivo não demonstra inviabilidade.",
        )
    validated = solver_status == "PATH_VALIDATED"
    lines = [
        presentation_text(
            language,
            "The alternative route is validated with these changes:",
            "A rota alternativa foi validada com estas alterações:",
        )
        if validated
        else presentation_text(
            language,
            "These proposed changes are an unvalidated candidate for the alternative route:",
            "Estas alterações propostas são um candidato ainda não validado para a rota alternativa:",
        )
    ]
    if modifications.model == "BRANDAO":
        improved = sum(
            target == "GRASS" for _, target in modifications.terrain_assignments
        )
        worsened = sum(
            target == "FOREST" for _, target in modifications.terrain_assignments
        )
        if improved:
            lines.append(
                presentation_text(
                    language,
                    f"- Change {improved} terrain cells from slow to fast.",
                    f"- Alterar {improved} células de terreno de lento para rápido.",
                )
            )
        if worsened:
            lines.append(
                presentation_text(
                    language,
                    f"- Change {worsened} terrain cells from fast to slow.",
                    f"- Alterar {worsened} células de terreno de rápido para lento.",
                )
            )
    else:
        if not original_optimal_available:
            lines.insert(
                0,
                presentation_text(
                    language,
                    "No route was available on the original map.",
                    "Nenhuma rota estava disponível no mapa original.",
                ),
            )
        if modifications.cell_openings:
            obstacles = sum(
                record.original_obstacle != 0 for record in modifications.cell_openings
            )
            impassable = sum(
                record.impassable_terrain for record in modifications.cell_openings
            )
            lines.append(
                presentation_text(
                    language,
                    f"- Make {len(modifications.cell_openings)} blocked cells traversable "
                    f"({obstacles} with obstacles, {impassable} with impassable terrain; causes may overlap).",
                    f"- Tornar transitáveis {len(modifications.cell_openings)} células bloqueadas "
                    f"({obstacles} com obstáculos, {impassable} com terreno intransponível; as causas podem se sobrepor).",
                )
            )
        groups = (
            (len(modifications.slope_adjustments), "directed slopes adjusted"),
            (
                len(modifications.environmental_speed_edges),
                "environmental speed limits removed",
            ),
            (
                len(modifications.robot_capability_edges),
                "hypothetical robot speed capability increases",
            ),
        )
        descriptions_pt = (
            "inclinações direcionais ajustadas",
            "limites ambientais de velocidade removidos",
            "aumentos hipotéticos da capacidade de velocidade do robô",
        )
        lines.extend(
            presentation_text(
                language,
                f"- {count} {description}.",
                f"- {count} {description_pt}.",
            )
            for (count, description), description_pt in zip(groups, descriptions_pt)
            if count
        )
    if not any(line.startswith("- ") for line in lines):
        lines.append(
            presentation_text(
                language,
                "- No interventions are proposed.",
                "- Nenhuma intervenção foi proposta.",
            )
        )
    if validated:
        lines.append(
            presentation_text(
                language,
                "The alternative route is globally optimal within the allowed tolerance; ties are possible.",
                "A rota alternativa é globalmente ótima dentro da tolerância permitida; podem existir empates.",
            )
        )
    elif stop_reason == "SUBGRAPH_OPTIMAL_ONLY":
        lines.append(
            presentation_text(
                language,
                "The route passed the reduced-subgraph check but not global validation.",
                "A rota passou na verificação do subgrafo reduzido, mas não na validação global.",
            )
        )
    else:
        lines.append(
            presentation_text(
                language,
                "Global validation has not passed.",
                "A validação global não foi aprovada.",
            )
        )
    if objective_certified:
        lines.append(
            presentation_text(
                language,
                "The intervention objective is certified minimal within the declared domain.",
                "O objetivo de intervenção tem mínimo certificado no domínio declarado.",
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
