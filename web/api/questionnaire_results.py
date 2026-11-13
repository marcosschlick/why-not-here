from dataclasses import dataclass, field
from statistics import fmean, median

from web.api.study_protocol import ESS_ITEMS

STUDY_GROUPS = ("control", "experimental")


@dataclass
class Observations:
    values: list[int] = field(default_factory=list)
    participant_ids: set[int] = field(default_factory=set)

    def add(self, participant_id: int, value: int) -> None:
        self.values.append(value)
        self.participant_ids.add(participant_id)

    def counts(self, expected: int) -> dict:
        return {
            "responses": len(self.values),
            "participants": len(self.participant_ids),
            "missing": expected - len(self.values),
        }


def participation_counts(connection, questionnaire_id: int) -> dict:
    counts = connection.execute(
        "SELECT count(*) AS total, "
        "count(*) FILTER (WHERE completed_at IS NOT NULL) AS completed, "
        "count(*) FILTER (WHERE completed_at IS NULL) AS in_progress, "
        "count(*) FILTER (WHERE completed_at IS NOT NULL AND study_group = 'control') AS control, "
        "count(*) FILTER (WHERE completed_at IS NOT NULL AND study_group = 'experimental') AS experimental "
        "FROM participations WHERE questionnaire_id = %s",
        (questionnaire_id,),
    ).fetchone()
    return {
        "total": counts["total"],
        "completed": counts["completed"],
        "in_progress": counts["in_progress"],
        "completed_by_group": {group: counts[group] for group in STUDY_GROUPS},
    }


def read_completed_answers(connection, questionnaire_id: int):
    return connection.execute(
        "SELECT p.id AS participant_id, p.study_group, p.scenario_order, "
        "q.type, q.scenario_id, q.configuration ->> 'item_id' AS item_id, "
        "CASE WHEN q.type = 'likert' AND jsonb_typeof(a.value) = 'number' "
        "THEN a.value ELSE NULL END AS rating, "
        "a.value -> 'choice' AS choice, a.value -> 'confidence' AS confidence, "
        "a.route_order, a.decision_visible_duration_ms "
        "FROM participations p JOIN answers a ON a.participation_id = p.id "
        "JOIN questions q ON q.id = a.question_id AND q.questionnaire_id = p.questionnaire_id "
        "WHERE p.questionnaire_id = %s AND p.completed_at IS NOT NULL",
        (questionnaire_id,),
    ).fetchall()


def valid_prediction_order(order, scenario_ids: set[int]) -> bool:
    return (
        isinstance(order, list)
        and len(order) == 6
        and all(type(scenario_id) is int and scenario_id > 0 for scenario_id in order)
        and len(set(order)) == 6
        and set(order) == scenario_ids
    )


def aggregate_results(participation: dict, scenario_ids: set[int], answers) -> dict:
    ess_items = [
        {
            "item_id": f"ess_{index}",
            "prompt": prompt,
            "groups": {
                group: {"distribution": [0] * 5, "responses": 0, "missing": 0}
                for group in STUDY_GROUPS
            },
        }
        for index, prompt in enumerate(ESS_ITEMS, start=1)
    ]
    items_by_id = {item["item_id"]: item for item in ess_items}
    observations = {
        group: {
            metric: Observations()
            for metric in ("accuracy", "confidence", "decision_time")
        }
        for group in STUDY_GROUPS
    }
    for answer in answers:
        group = answer["study_group"]
        participant_id = answer["participant_id"]
        if answer["type"] == "likert":
            item = items_by_id.get(answer["item_id"])
            rating = answer["rating"]
            if item is not None and type(rating) is int and 1 <= rating <= 5:
                distribution = item["groups"][group]
                distribution["distribution"][rating - 1] += 1
                distribution["responses"] += 1
            continue
        order = answer["scenario_order"]
        if (
            answer["type"] != "route_scenario"
            or not valid_prediction_order(order, scenario_ids)
            or answer["scenario_id"] not in order[3:]
        ):
            continue
        metrics = observations[group]
        choice = answer["choice"]
        routes = answer["route_order"]
        if (
            type(choice) is int
            and choice in (0, 1)
            and routes in (["optimal", "alternative"], ["alternative", "optimal"])
        ):
            metrics["accuracy"].add(participant_id, int(routes[choice] == "optimal"))
        confidence = answer["confidence"]
        if type(confidence) is int and 0 <= confidence <= 100:
            metrics["confidence"].add(participant_id, confidence)
        duration = answer["decision_visible_duration_ms"]
        if type(duration) is int and duration >= 0:
            metrics["decision_time"].add(participant_id, duration)
    predictions = {}
    for group in STUDY_GROUPS:
        completed = participation["completed_by_group"][group]
        expected = 3 * completed
        for item in ess_items:
            counts = item["groups"][group]
            counts["missing"] = completed - counts["responses"]
        accuracy = observations[group]["accuracy"]
        confidence = observations[group]["confidence"]
        decision_time = observations[group]["decision_time"]
        correct = sum(accuracy.values)
        predictions[group] = {
            **accuracy.counts(expected),
            "correct": correct,
            "proportion": correct / len(accuracy.values) if accuracy.values else None,
            "confidence": {
                **confidence.counts(expected),
                "mean": fmean(confidence.values) if confidence.values else None,
            },
            "decision_time": {
                **decision_time.counts(expected),
                "median_seconds": median(decision_time.values) / 1000
                if decision_time.values
                else None,
            },
        }
    return {
        "participation": participation,
        "ess_items": ess_items,
        "predictions": predictions,
    }
