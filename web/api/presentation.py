import math

from src.incremental.explanation import (
    generate_cost_baseline_justification,
)
from src.pipeline.reporting import execution_error


def build_result_presentation(result) -> dict[str, str | None]:
    metrics = result.metrics
    explanation = result.explanation_text_pt

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

    return data["explanation_text_pt"]
