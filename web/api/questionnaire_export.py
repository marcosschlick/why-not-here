import json
from collections.abc import Iterable

from .csv_export import render_csv as render_safe_csv

CSV_FIELDS = (
    "participation_code",
    "questionnaire_id",
    "group",
    "phase",
    "question_id",
    "step_position",
    "scenario_id",
    "scenario_position",
    "phase_position",
    "requested_seed",
    "effective_seed",
    "route_a_kind",
    "route_a_path",
    "route_b_kind",
    "route_b_path",
    "chosen_route",
    "chosen_route_kind",
    "confidence",
    "initial_reason",
    "post_explanation_reason",
    "item_id",
    "prompt",
    "source_scale",
    "source_item_number",
    "rating",
    "visible_duration_ms",
    "decision_visible_duration_ms",
    "first_selection_visible_duration_ms",
    "final_selection_visible_duration_ms",
    "choice_changed",
    "explanation_visible_duration_ms",
    "confirmed_at",
    "explanation_completed_at",
    "participation_started_at",
    "participation_completed_at",
)


def read_export_answers(connection, questionnaire_id: int):
    return connection.execute(
        "SELECT p.export_code, p.study_group, p.scenario_order, "
        "p.started_at AS participation_started_at, p.completed_at AS participation_completed_at, "
        "q.id AS question_id, q.type, q.position, q.scenario_id, q.configuration, q.prompt, "
        "s.data -> 'optimal_path' AS optimal_path, s.data -> 'alternative_path' AS alternative_path, "
        "s.data -> 'requested_seed' AS requested_seed, s.data -> 'generation' -> 'effective_seed' AS effective_seed, "
        "a.value, a.route_order, a.post_explanation_reason, a.visible_duration_ms, "
        "a.decision_visible_duration_ms, a.first_selection_visible_duration_ms, "
        "a.final_selection_visible_duration_ms, a.choice_changed, a.explanation_visible_duration_ms, "
        "a.confirmed_at, a.explanation_completed_at "
        "FROM participations p JOIN questions q ON q.questionnaire_id = p.questionnaire_id "
        "LEFT JOIN scenarios s ON s.id = q.scenario_id AND s.questionnaire_id = p.questionnaire_id "
        "LEFT JOIN answers a ON a.participation_id = p.id AND a.question_id = q.id "
        "WHERE p.questionnaire_id = %s AND p.completed_at IS NOT NULL "
        "ORDER BY p.export_code, q.position",
        (questionnaire_id,),
    ).fetchall()


def export_rows(questionnaire_id: int, answers: Iterable[dict]):
    for answer in answers:
        row = {key: answer.get(key) for key in CSV_FIELDS}
        row.update(
            participation_code=answer["export_code"],
            questionnaire_id=questionnaire_id,
            group=answer["study_group"],
        )
        value = answer["value"]
        if answer["type"] == "likert":
            metadata = answer["configuration"]
            row.update(
                phase="likert",
                step_position=answer["position"],
                phase_position=answer["position"] - 6,
                rating=value,
                item_id=metadata["item_id"],
                source_scale=metadata["source_scale"],
                source_item_number=metadata["source_item_number"],
            )
        else:
            index = answer["scenario_order"].index(answer["scenario_id"])
            row.update(
                phase="route_assessment" if index < 3 else "route_prediction",
                scenario_position=index + 1,
                phase_position=index % 3 + 1,
                step_position=2 * index + 1 if index < 3 else 18 + index,
            )
            value = value if isinstance(value, dict) else {}
            row.update(
                confidence=value.get("confidence"), initial_reason=value.get("reason")
            )
            order = answer["route_order"]
            if order in (["optimal", "alternative"], ["alternative", "optimal"]):
                for label, kind in zip(("a", "b"), order, strict=True):
                    row[f"route_{label}_kind"] = kind
                    row[f"route_{label}_path"] = json.dumps(
                        answer[f"{kind}_path"], separators=(",", ":")
                    )
                choice = value.get("choice")
                if type(choice) is int and choice in (0, 1):
                    row.update(
                        chosen_route="AB"[choice], chosen_route_kind=order[choice]
                    )
        yield row


def render_csv(rows: Iterable[dict]) -> str:
    return render_safe_csv(rows, CSV_FIELDS)
