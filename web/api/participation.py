import hashlib
import hmac
import math
import secrets
from itertools import pairwise
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from src.visual.appearance import resolve_map_appearance
from web.api.database import connect_database
from web.api.questionnaires import (
    QuestionInput,
    get_questionnaire,
    require_draft,
    valid_drawing_scenario,
    validate_scenario,
)

router = APIRouter(prefix="/api", tags=["participation"])
public_router = APIRouter(prefix="/api", tags=["participation"])
question_adapter = TypeAdapter(QuestionInput)


class AnswerInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: int
    value: Any


class SubmissionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    submission_key: UUID
    answers: list[AnswerInput]


class RouteConfirmationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    submission_key: UUID
    choice: int = Field(strict=True, ge=0, le=1)


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
    check_justifications(question, 422)
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
            "UPDATE questionnaires SET status = 'active', access_token = %s, group_secret = %s WHERE id = %s",
            (token, secrets.token_hex(32), questionnaire_id),
        )
        return {"status": "active", "access_token": token}


@router.post("/questionnaires/{questionnaire_id}/close")
def close_questionnaire(questionnaire_id: int):
    with connect_database() as connection:
        questionnaire = get_questionnaire(connection, questionnaire_id, lock=True)
        if questionnaire["status"] == "closed":
            return {"status": "closed", "closed_at": questionnaire["closed_at"]}
        if questionnaire["status"] != "active":
            raise HTTPException(
                status_code=409, detail="Only active questionnaires can be closed"
            )
        return connection.execute(
            "UPDATE questionnaires SET status = 'closed', closed_at = CURRENT_TIMESTAMP "
            "WHERE id = %s RETURNING status, closed_at",
            (questionnaire_id,),
        ).fetchone()


def active_questionnaire(connection, token, *, lock=False, allow_closed=False):
    query = "SELECT id, title, description, group_secret, status FROM questionnaires WHERE access_token = %s AND status IN ('active', 'closed')"
    if lock:
        query += " FOR UPDATE"
    questionnaire = connection.execute(
        query,
        (token,),
    ).fetchone()
    if questionnaire is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    if questionnaire["status"] == "closed" and not allow_closed:
        raise HTTPException(status_code=410, detail="This questionnaire is closed")
    return questionnaire


def check_justifications(question, status_code):
    if question["scenario_id"] is None:
        return
    data = question["data"]
    if not isinstance(data, dict) or any(
        not isinstance(data.get(key), str) or not data[key].strip()
        for key in ("cost_baseline_text", "explanation_text")
    ):
        raise HTTPException(
            status_code=status_code,
            detail="Scenario is missing a required justification; generate a new scenario",
        )


def assigned_group(connection, questionnaire, submission_key):
    secret = questionnaire["group_secret"]
    if not secret:
        secret = secrets.token_hex(32)
        connection.execute(
            "UPDATE questionnaires SET group_secret = %s WHERE id = %s",
            (secret, questionnaire["id"]),
        )
    digest = hmac.new(
        secret.encode(), str(submission_key).encode(), hashlib.sha256
    ).digest()
    return "experimental" if digest[0] & 1 else "control"


def route_order(submission_key: UUID, question_id: int) -> list[str]:
    digest = hashlib.sha256(f"{submission_key}:{question_id}".encode()).digest()
    if digest[0] & 1:
        return ["alternative", "optimal"]
    return ["optimal", "alternative"]


def public_question(
    question,
    submission_key: UUID,
    saved_order=None,
    study_group=None,
    confirmed_choice=None,
    justification_ready=True,
):
    public = {key: question[key] for key in ("id", "prompt", "type", "configuration")}
    if question["type"] == "route_choice":
        public["confirmed_choice"] = confirmed_choice
    if question["scenario_id"] is not None and not justification_ready:
        public["justification_pending"] = True
    if (
        question["scenario_id"] is not None
        and study_group is not None
        and justification_ready
    ):
        field = "cost_baseline_text" if study_group == "control" else "explanation_text"
        public["justification"] = question["data"][field]
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
            paths = {
                "optimal": data["optimal_path"],
                "alternative": data["alternative_path"],
            }
            order = saved_order or route_order(submission_key, question["id"])
            public["scenario"]["routes"] = [paths[name] for name in order]
    return public


@public_router.get("/participate/{token}")
def get_public_questionnaire(token: str, submission_key: UUID):
    with connect_database() as connection:
        questionnaire = active_questionnaire(connection, token, lock=True)
        existing = connection.execute(
            "SELECT id, study_group FROM participations WHERE questionnaire_id = %s AND submission_key = %s",
            (questionnaire["id"], submission_key),
        ).fetchone()
        saved_orders = {}
        confirmed_choices = {}
        questions = read_questions(connection, questionnaire["id"])
        for question in questions:
            check_justifications(question, 409)
        study_group = (
            existing["study_group"]
            if existing
            else assigned_group(connection, questionnaire, submission_key)
        )
        if existing:
            rows = connection.execute(
                "SELECT question_id, value, route_order FROM answers WHERE participation_id = %s",
                (existing["id"],),
            ).fetchall()
            saved_orders = {
                row["question_id"]: row["route_order"] or ["optimal", "alternative"]
                for row in rows
            }
            route_question_ids = {
                q["id"] for q in questions if q["type"] == "route_choice"
            }
            confirmed_choices = {
                row["question_id"]: row["value"]
                for row in rows
                if row["question_id"] in route_question_ids
            }
        else:
            rows = connection.execute(
                "SELECT rc.question_id, rc.choice, rc.route_order FROM route_confirmations rc "
                "JOIN questions q ON q.id = rc.question_id WHERE q.questionnaire_id = %s AND rc.submission_key = %s",
                (questionnaire["id"], submission_key),
            ).fetchall()
            confirmed_choices = {row["question_id"]: row["choice"] for row in rows}
            saved_orders = {row["question_id"]: row["route_order"] for row in rows}
        pending_scenarios = {
            q["scenario_id"]
            for q in questions
            if q["type"] == "route_choice" and q["id"] not in confirmed_choices
        }
        return {
            "title": questionnaire["title"],
            "description": questionnaire["description"],
            "submission_completed": existing is not None,
            "questions": [
                public_question(
                    q,
                    submission_key,
                    saved_orders.get(q["id"]),
                    study_group,
                    confirmed_choices.get(q["id"]),
                    q["scenario_id"] not in pending_scenarios,
                )
                for q in questions
            ],
        }


@public_router.post("/participate/{token}/questions/{question_id}/confirm")
def confirm_route_choice(token: str, question_id: int, payload: RouteConfirmationInput):
    with connect_database() as connection:
        questionnaire = active_questionnaire(connection, token, lock=True)
        question = connection.execute(
            "SELECT id FROM questions WHERE id = %s AND questionnaire_id = %s AND type = 'route_choice'",
            (question_id, questionnaire["id"]),
        ).fetchone()
        if question is None:
            raise HTTPException(
                status_code=404, detail="Route choice question not found"
            )
        completed = connection.execute(
            "SELECT a.value FROM answers a JOIN participations p ON p.id = a.participation_id "
            "WHERE p.questionnaire_id = %s AND p.submission_key = %s AND a.question_id = %s",
            (questionnaire["id"], payload.submission_key, question_id),
        ).fetchone()
        if completed is not None:
            if completed["value"] != payload.choice:
                raise HTTPException(
                    status_code=409, detail="Route choice is already confirmed"
                )
            return {"choice": payload.choice}
        existing = connection.execute(
            "SELECT choice FROM route_confirmations WHERE question_id = %s AND submission_key = %s",
            (question_id, payload.submission_key),
        ).fetchone()
        if existing is not None:
            if existing["choice"] != payload.choice:
                raise HTTPException(
                    status_code=409, detail="Route choice is already confirmed"
                )
            return {"choice": payload.choice}
        connection.execute(
            "INSERT INTO route_confirmations (question_id, submission_key, choice, route_order) VALUES (%s, %s, %s, %s)",
            (
                question_id,
                payload.submission_key,
                payload.choice,
                Jsonb(route_order(payload.submission_key, question_id)),
            ),
        )
        return {"choice": payload.choice}


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


def same_value(first, second):
    if isinstance(first, list) and isinstance(second, list):
        return len(first) == len(second) and all(
            same_value(a, b) for a, b in zip(first, second, strict=True)
        )
    if type(first) in (int, float) and type(second) in (int, float):
        return first == second
    return type(first) is type(second) and first == second


@public_router.post("/participate/{token}/submit", status_code=status.HTTP_201_CREATED)
def submit_answers(token: str, payload: SubmissionInput):
    with connect_database() as connection:
        questionnaire = active_questionnaire(
            connection, token, lock=True, allow_closed=True
        )
        existing = connection.execute(
            "SELECT id FROM participations WHERE questionnaire_id = %s AND submission_key = %s",
            (questionnaire["id"], payload.submission_key),
        ).fetchone()
        questions = read_questions(connection, questionnaire["id"])
        answers = {answer.question_id: answer.value for answer in payload.answers}
        if existing:
            rows = connection.execute(
                "SELECT question_id, value FROM answers WHERE participation_id = %s",
                (existing["id"],),
            ).fetchall()
            saved = {row["question_id"]: row["value"] for row in rows}
            if (
                len(answers) != len(payload.answers)
                or saved.keys() != answers.keys()
                or not all(same_value(saved[key], answers[key]) for key in saved)
            ):
                raise HTTPException(
                    status_code=409,
                    detail="This submission was already completed with different answers",
                )
            return {"status": "completed", "participation_id": existing["id"]}
        if questionnaire["status"] == "closed":
            raise HTTPException(status_code=410, detail="This questionnaire is closed")
        if len(answers) != len(payload.answers) or set(answers) != {
            q["id"] for q in questions
        }:
            raise HTTPException(
                status_code=422, detail="Every question must have exactly one answer"
            )
        rows = connection.execute(
            "SELECT rc.question_id, rc.choice, rc.route_order FROM route_confirmations rc "
            "JOIN questions q ON q.id = rc.question_id WHERE q.questionnaire_id = %s AND rc.submission_key = %s",
            (questionnaire["id"], payload.submission_key),
        ).fetchall()
        confirmations = {row["question_id"]: row for row in rows}
        for question in questions:
            check_justifications(question, 409)
            if not validate_answer(question, answers[question["id"]]):
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid answer for question {question['id']}",
                )
            if question["type"] == "route_choice":
                confirmation = confirmations.get(question["id"])
                if (
                    confirmation is None
                    or confirmation["choice"] != answers[question["id"]]
                ):
                    raise HTTPException(
                        status_code=409,
                        detail=f"Confirm the route choice for question {question['id']}",
                    )
        participation = connection.execute(
            "INSERT INTO participations (questionnaire_id, submission_key, completed_at, study_group) VALUES (%s, %s, CURRENT_TIMESTAMP, %s) RETURNING id",
            (
                questionnaire["id"],
                payload.submission_key,
                assigned_group(connection, questionnaire, payload.submission_key),
            ),
        ).fetchone()
        for question in questions:
            connection.execute(
                "INSERT INTO answers (participation_id, question_id, value, route_order) VALUES (%s, %s, %s, %s)",
                (
                    participation["id"],
                    question["id"],
                    Jsonb(answers[question["id"]]),
                    Jsonb(confirmations[question["id"]]["route_order"])
                    if question["type"] == "route_choice"
                    else None,
                ),
            )
        return {"status": "completed", "participation_id": participation["id"]}
