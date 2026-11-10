import math
import secrets
from itertools import pairwise
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError

from src.visual.appearance import resolve_map_appearance
from web.api.database import connect_database
from web.api.questionnaires import (
    QuestionInput,
    require_draft,
    valid_drawing_scenario,
    validate_scenario,
)

router = APIRouter(prefix="/api", tags=["participation"])
question_adapter = TypeAdapter(QuestionInput)


class AnswerInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: int
    value: Any


class SubmissionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    submission_key: UUID
    answers: list[AnswerInput]


def read_questions(connection, questionnaire_id):
    return connection.execute(
        "SELECT q.id, q.prompt, q.type, q.configuration, q.scenario_id, s.data, s.configuration AS scenario_configuration "
        "FROM questions q LEFT JOIN scenarios s ON s.id = q.scenario_id AND s.questionnaire_id = q.questionnaire_id "
        "WHERE q.questionnaire_id = %s ORDER BY q.position, q.id",
        (questionnaire_id,),
    ).fetchall()


def check_question(connection, questionnaire_id, question):
    payload = {
        "type": question["type"],
        "prompt": question["prompt"],
        "configuration": question["configuration"],
    }
    if question["type"] in {"route_choice", "route_drawing"}:
        payload["scenario_id"] = question["scenario_id"]
    try:
        model = question_adapter.validate_python(payload)
        validate_scenario(connection, questionnaire_id, model)
    except (ValidationError, HTTPException) as error:
        raise HTTPException(
            status_code=422,
            detail="Questionnaire contains an invalid question or scenario",
        ) from error
    if question["type"] in {
        "route_choice",
        "route_drawing",
    } and not valid_drawing_scenario(question["data"]):
        raise HTTPException(status_code=422, detail="Scenario map is incomplete")
    if question["type"] in {"route_choice", "route_drawing"}:
        data = question["data"]
        if data["map"].get("connectivity") not in (4, 8):
            raise HTTPException(status_code=422, detail="Scenario map is incomplete")
        if question["type"] == "route_choice" and not all(
            validate_route(data[key], data)
            for key in ("optimal_path", "alternative_path")
        ):
            raise HTTPException(status_code=422, detail="Scenario routes are invalid")


@router.post("/questionnaires/{questionnaire_id}/activate")
def activate_questionnaire(questionnaire_id: int):
    with connect_database() as connection:
        require_draft(connection, questionnaire_id)
        questions = read_questions(connection, questionnaire_id)
        if not questions:
            raise HTTPException(
                status_code=422,
                detail="Questionnaire must contain at least one question",
            )
        for question in questions:
            check_question(connection, questionnaire_id, question)
        token = secrets.token_urlsafe(32)
        connection.execute(
            "UPDATE questionnaires SET status = 'active', access_token = %s WHERE id = %s",
            (token, questionnaire_id),
        )
        return {"status": "active", "access_token": token}


def active_questionnaire(connection, token, *, lock=False):
    query = "SELECT id, title, description FROM questionnaires WHERE access_token = %s AND status = 'active'"
    if lock:
        query += " FOR UPDATE"
    questionnaire = connection.execute(
        query,
        (token,),
    ).fetchone()
    if questionnaire is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    return questionnaire


def public_question(question):
    public = {key: question[key] for key in ("id", "prompt", "type", "configuration")}
    if question["type"] in {"route_choice", "route_drawing"}:
        data = question["data"]
        grid = data["map"]
        public["scenario"] = {
            "map": grid,
            "start": data["start"],
            "goal": data["goal"],
            "terrain_colors": question["scenario_configuration"].get(
                "TERRAIN_COLORS", {}
            ),
            "appearance": resolve_map_appearance(grid["h"], grid["w"]),
        }
        if question["type"] == "route_choice":
            public["scenario"]["routes"] = [
                data["optimal_path"],
                data["alternative_path"],
            ]
    return public


@router.get("/participate/{token}")
def get_public_questionnaire(token: str):
    with connect_database() as connection:
        questionnaire = active_questionnaire(connection, token)
        return {
            "title": questionnaire["title"],
            "description": questionnaire["description"],
            "questions": [
                public_question(q)
                for q in read_questions(connection, questionnaire["id"])
            ],
        }


def validate_route(value, data):
    grid = data["map"]
    height, width, connectivity = grid["h"], grid["w"], grid["connectivity"]
    if not isinstance(value, list) or not value:
        return False
    if any(
        not isinstance(p, list)
        or len(p) != 2
        or any(type(n) is not int for n in p)
        or not (0 <= p[0] < height and 0 <= p[1] < width)
        for p in value
    ):
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


def validate_answer(question, value):
    kind, config = question["type"], question["configuration"]
    if kind == "text":
        return isinstance(value, str) and bool(value.strip())
    if kind == "choice":
        return type(value) is int and 0 <= value < len(config["options"])
    if kind == "likert":
        return type(value) is int and config["min"] <= value <= config["max"]
    if kind == "numeric":
        return (
            type(value) in (float, int)
            and math.isfinite(value)
            and ("min" not in config or value >= config["min"])
            and ("max" not in config or value <= config["max"])
        )
    if kind == "route_choice":
        return type(value) is int and value in (0, 1)
    if kind == "route_drawing":
        return validate_route(value, question["data"])
    return False


@router.post("/participate/{token}/submit", status_code=status.HTTP_201_CREATED)
def submit_answers(token: str, payload: SubmissionInput):
    with connect_database() as connection:
        questionnaire = active_questionnaire(connection, token, lock=True)
        existing = connection.execute(
            "SELECT id FROM participations WHERE questionnaire_id = %s AND submission_key = %s",
            (questionnaire["id"], payload.submission_key),
        ).fetchone()
        if existing:
            return {"status": "completed", "participation_id": existing["id"]}
        questions = read_questions(connection, questionnaire["id"])
        answers = {answer.question_id: answer.value for answer in payload.answers}
        if len(answers) != len(payload.answers) or set(answers) != {
            q["id"] for q in questions
        }:
            raise HTTPException(
                status_code=422, detail="Every question must have exactly one answer"
            )
        for question in questions:
            if not validate_answer(question, answers[question["id"]]):
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid answer for question {question['id']}",
                )
        participation = connection.execute(
            "INSERT INTO participations (questionnaire_id, submission_key, completed_at) VALUES (%s, %s, CURRENT_TIMESTAMP) RETURNING id",
            (questionnaire["id"], payload.submission_key),
        ).fetchone()
        for question in questions:
            connection.execute(
                "INSERT INTO answers (participation_id, question_id, value) VALUES (%s, %s, %s)",
                (participation["id"], question["id"], Jsonb(answers[question["id"]])),
            )
        return {"status": "completed", "participation_id": participation["id"]}
