import math
import re

from src.incremental.explanation import (
    generate_cost_baseline_justification,
    generate_explanation_text,
)
from src.isp.types import SemanticModifications
from src.pipeline.reporting import execution_error

PRECHECK_MESSAGES = {
    "The alternative path does not match the supplied start and goal.": "A rota alternativa não corresponde ao início e ao destino informados.",
    "The alternative path contains nodes outside the grid.": "A rota alternativa contém células fora da grade.",
    "The alternative path contains repeated nodes.": "A rota alternativa contém células repetidas.",
    "The alternative path contains non-adjacent nodes.": "A rota alternativa contém células não adjacentes.",
    "No traversable component is available for automatic endpoints.": "Não há uma região transitável disponível para definir automaticamente o início e o destino.",
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
    match = re.fullmatch(
        r"Endpoint \((-?\d+), (-?\d+)\) falls outside the grid\.", message
    )
    if match:
        return (
            f"O ponto extremo ({match.group(1)}, {match.group(2)}) está fora da grade."
        )
    return None


def build_result_presentation(result) -> dict[str, str | None]:
    metrics = result.metrics
    explanation_options = {
        "modifications": result.modifications,
        "grid": result.prepared_grid,
        "stop_reason": metrics.get("stop_reason"),
        "solver_status": "PATH_VALIDATED"
        if result.success
        else "CANDIDATE_UNVALIDATED",
        "objective_cost": (metrics.get("interventions") or {}).get("objective_cost"),
        "objective_certified": metrics.get("objective_certified", False),
        "original_optimal_available": bool(result.original_optimal_path),
    }
    generated_english = generate_explanation_text(**explanation_options)
    if result.explanation_text == generated_english:
        explanation = generate_explanation_text(**explanation_options, language="pt-BR")
    else:
        explanation = precheck_presentation(
            result.explanation_text
        ) or generate_explanation_text(**explanation_options, language="pt-BR")

    baseline = None
    alternative_cost = (
        math.inf
        if (metrics.get("cost_states") or {}).get("original_alternative")
        == "IMPASSABLE"
        else metrics.get("original_alternative_cost")
    )
    if result.cost_baseline_text and alternative_cost is not None:
        baseline = generate_cost_baseline_justification(
            result.original_optimal_cost, alternative_cost, language="pt-BR"
        )

    error = execution_error(result)
    if (
        error
        == "Modeled edge costs differ from the costs applied to the candidate map."
    ):
        error_presentation = "Os custos modelados das arestas diferem dos custos aplicados ao mapa candidato."
    elif error:
        error_presentation = "A execução falhou antes de concluir o cálculo. Consulte o estado do solver."
    else:
        error_presentation = None

    return {
        "explanation_text": explanation,
        "cost_baseline_text": baseline,
        "execution_error": error_presentation,
    }


def saved_scenario_justification(data: dict, group: str) -> str:
    metrics = data["metrics"]
    if group == "cost_based":
        states = metrics.get("cost_states") or {}
        optimal_cost = (
            math.inf
            if states.get("original_optimal") == "UNREACHABLE"
            else data["original_optimal_cost"]
        )
        alternative_cost = (
            math.inf
            if states.get("original_alternative") == "IMPASSABLE"
            else data["original_alternative_cost"]
        )
        return generate_cost_baseline_justification(
            optimal_cost, alternative_cost, language="pt-BR"
        )

    from web.api.schemas import SemanticModificationsData

    records = data.get("modifications")
    modifications = None
    if records is not None:
        validated = SemanticModificationsData.model_validate(records)
        modifications = SemanticModifications(
            model=validated.model,
            terrain_nodes=validated.terrain_nodes,
            terrain_assignments=validated.terrain_assignments,
            cell_openings=validated.cell_openings,
            slope_adjustments=validated.slope_adjustments,
            environmental_speed_edges=validated.environmental_speed_edges,
            robot_capability_edges=validated.robot_capability_edges,
        )
    return generate_explanation_text(
        modifications,
        stop_reason=metrics.get("stop_reason"),
        solver_status="PATH_VALIDATED" if data["success"] else "CANDIDATE_UNVALIDATED",
        objective_cost=(metrics.get("interventions") or {}).get("objective_cost"),
        objective_certified=metrics.get("objective_certified", False),
        original_optimal_available=bool(data["original_optimal_path"]),
        language="pt-BR",
    )
