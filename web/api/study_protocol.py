import hashlib
from itertools import pairwise
from typing import Annotated, Literal
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from src import config
from src.visual.appearance import resolve_map_appearance

PROTOCOL_VERSION = "route-study-v2"
ESS_TITLE = "Explanation Satisfaction Scale (ESS), adapted for route planning"
ESS_SOURCE = (
    "Hoffman et al., Metrics for Explainable AI: Challenges and Prospects, Appendix C"
)
ESS_ITEMS = (
    "From the explanations, I understand how the system chooses routes.",
    "The explanations of how the system chooses routes are satisfying.",
    "The explanations of how the system chooses routes have sufficient detail.",
    "The explanations of how the system chooses routes seem complete.",
    "The explanations tell me how to use the system’s route recommendations.",
    "The explanations are useful for identifying the fastest route.",
    "The explanations help me assess how accurately the system identifies the fastest route.",
    "The explanations let me judge when I should and should not trust the system’s route choices.",
)
StudyGroup = Literal["control", "experimental"]
ScenarioId = Annotated[int, Field(strict=True, gt=0)]


class ProtocolInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario_ids: list[ScenarioId] = Field(min_length=6, max_length=6)


class RoutePrediction(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    choice: int = Field(strict=True, ge=0, le=1)
    confidence: int = Field(strict=True, ge=0, le=100)


ReasonText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=20, max_length=1000)
]


class ExplanationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: ReasonText


class RouteAssessment(RoutePrediction):
    reason: ReasonText


def protocol_selection(questions):
    return {
        "scenario_ids": [
            q["scenario_id"] for q in questions if q["type"] == "route_scenario"
        ],
    }


def build_questions(payload: ProtocolInput):
    questions = []
    for scenario_id in payload.scenario_ids:
        questions.append(
            {
                "type": "route_scenario",
                "prompt": "Route scenario",
                "scenario_id": scenario_id,
                "configuration": {},
            }
        )
    for index, prompt in enumerate(ESS_ITEMS, start=1):
        questions.append(
            {
                "type": "likert",
                "prompt": prompt,
                "scenario_id": None,
                "configuration": {"min": 1, "max": 5, "item_id": f"ess_{index}"},
            }
        )
    return [
        {**question, "position": index}
        for index, question in enumerate(questions, start=1)
    ]


def read_questions(connection, questionnaire_id, *, include_scenarios=True):
    query = "SELECT q.id, q.prompt, q.type, q.configuration, q.scenario_id, q.position"
    if include_scenarios:
        query += ", s.data, s.configuration AS scenario_configuration"
    query += " FROM questions q "
    if include_scenarios:
        query += "LEFT JOIN scenarios s ON s.id = q.scenario_id AND s.questionnaire_id = q.questionnaire_id "
    query += "WHERE q.questionnaire_id = %s ORDER BY q.position"
    return connection.execute(query, (questionnaire_id,)).fetchall()


def valid_point(point):
    return (
        isinstance(point, list)
        and len(point) == 2
        and all(type(n) is int and n >= 0 for n in point)
    )


def valid_scenario_map(data):
    if not isinstance(data, dict) or not isinstance(data.get("map"), dict):
        return False
    grid = data["map"]
    height, width = grid.get("h"), grid.get("w")
    if type(height) is not int or type(width) is not int or height <= 0 or width <= 0:
        return False
    for layer in ("terrain", "elevation", "obstacle"):
        matrix = grid.get(layer)
        if not isinstance(matrix, list) or len(matrix) != height:
            return False
        if any(not isinstance(row, list) or len(row) != width for row in matrix):
            return False
    return grid.get("connectivity") in (4, 8) and all(
        valid_point(point) and point[0] < height and point[1] < width
        for point in (data.get("start"), data.get("goal"))
    )


def validate_route(value, data):
    grid = data["map"]
    height, width, connectivity = grid["h"], grid["w"], grid["connectivity"]
    if not isinstance(value, list) or not value:
        return False
    if any(not valid_point(p) or p[0] >= height or p[1] >= width for p in value):
        return False
    if (
        value[0] != data["start"]
        or value[-1] != data["goal"]
        or len({tuple(p) for p in value}) != len(value)
    ):
        return False
    for first, second in pairwise(value):
        dr, dc = abs(first[0] - second[0]), abs(first[1] - second[1])
        if max(dr, dc) != 1 or (connectivity == 4 and dr + dc != 1):
            return False
    return connectivity in (4, 8)


def validate_scenario(data):
    if (
        not valid_scenario_map(data)
        or not all(
            validate_route(data.get(key), data)
            for key in ("optimal_path", "alternative_path")
        )
        or data["optimal_path"] == data["alternative_path"]
    ):
        raise HTTPException(
            status_code=422,
            detail="Scenario must contain a valid map and two distinct routes",
        )
    if data.get("success") is not True:
        raise HTTPException(
            status_code=422, detail="Scenario calculation must be successful"
        )
    if any(
        not isinstance(data.get(key), str) or not data[key].strip()
        for key in ("cost_baseline_text", "explanation_text")
    ):
        raise HTTPException(
            status_code=422, detail="Scenario must contain both group explanations"
        )


def require_protocol(questions):
    selection = protocol_selection(questions)
    ids = selection["scenario_ids"]
    if len(questions) != 14 or len(ids) != 6 or len(set(ids)) != 6:
        raise HTTPException(
            status_code=422,
            detail="Select six different scenarios",
        )
    expected = build_questions(ProtocolInput(**selection))
    for question, template in zip(questions, expected, strict=True):
        if any(question[key] != value for key, value in template.items()):
            raise HTTPException(
                status_code=422, detail="Questionnaire protocol is incomplete"
            )
        if question["scenario_id"] is not None:
            validate_scenario(question["data"])


def scenario_order(questions, submission_key):
    ids = protocol_selection(questions)["scenario_ids"]
    return sorted(
        ids,
        key=lambda scenario_id: hashlib.sha256(
            f"{submission_key}:scenario:{scenario_id}".encode()
        ).digest(),
    )


def study_steps(questions, order):
    scenarios = {
        q["scenario_id"]: q for q in questions if q["type"] == "route_scenario"
    }
    steps = []
    for scenario_id in order[:3]:
        steps.extend(
            (
                ("route_assessment", scenarios[scenario_id]),
                ("explanation", scenarios[scenario_id]),
            )
        )
    steps.extend(("likert", q) for q in questions if q["type"] == "likert")
    steps.extend(
        ("route_prediction", scenarios[scenario_id]) for scenario_id in order[3:]
    )
    return steps


def route_order(submission_key: UUID, question_id: int) -> list[str]:
    digest = hashlib.sha256(f"{submission_key}:{question_id}".encode()).digest()
    return ["alternative", "optimal"] if digest[0] & 1 else ["optimal", "alternative"]


def resolve_scenario_terrain_colors(configuration):
    return configuration.get("TERRAIN_COLORS") or config.TERRAIN_COLORS


def serialize_step(questions, index, submission_key, group, scenario_ids):
    steps = study_steps(questions, scenario_ids)
    if index < 0 or index > len(steps):
        raise HTTPException(status_code=422, detail="Invalid study step")
    if index == len(steps):
        return None
    kind, question = steps[index]
    step = {
        "index": index,
        "type": kind,
        "question_id": question["id"],
        "prompt": question["prompt"],
    }
    if kind == "likert":
        step.update(
            instrument=ESS_TITLE,
            source=ESS_SOURCE,
            item_id=question["configuration"]["item_id"],
            item_number=int(question["configuration"]["item_id"].split("_")[1]),
        )
        return step
    data = question["data"]
    order = route_order(submission_key, question["id"])
    scenario_index = scenario_ids.index(question["scenario_id"])
    step["scenario_number"] = scenario_index % 3 + 1
    step["prompt"] = (
        "Which route do you think the system would choose?"
        if kind == "route_prediction"
        else "Which route do you think is faster?"
    )
    step["scenario"] = {
        "map": data["map"],
        "start": data["start"],
        "goal": data["goal"],
        "terrain_colors": resolve_scenario_terrain_colors(
            question["scenario_configuration"]
        ),
        "appearance": resolve_map_appearance(data["map"]["h"], data["map"]["w"]),
        "routes": [data[f"{name}_path"] for name in order],
    }
    if kind == "explanation":
        step["prompt"] = "Explanation of the system’s route choice"
        step["response_prompt"] = (
            "After reading the explanation, which characteristics explain the system’s route choice?"
        )
        step["justification"] = data[
            "cost_baseline_text" if group == "control" else "explanation_text"
        ]
        step["scenario"]["route_order"] = order
        if group == "experimental":
            step["scenario"]["show_explanation_map"] = True
            step["scenario"]["modifications"] = data.get("modifications")
    return step
