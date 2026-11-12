import hashlib
import hmac
import secrets
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Response
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from web.api.database import connect_database
from web.api.questionnaires import get_questionnaire, require_draft
from web.api.study_protocol import (
    RouteAssessment,
    read_questions,
    require_protocol,
    route_order,
    serialize_step,
    study_steps,
)

router = APIRouter(prefix="/api", tags=["participation"])
public_router = APIRouter(prefix="/api", tags=["participation"])


class SubmissionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    submission_key: UUID


class StepConfirmationInput(SubmissionInput):
    value: Any = None
    visible_duration_ms: int = Field(strict=True, ge=0)


@router.post("/questionnaires/{questionnaire_id}/activate")
def activate_questionnaire(questionnaire_id: int):
    with connect_database() as connection:
        require_draft(connection, questionnaire_id)
        require_protocol(read_questions(connection, questionnaire_id))
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
            "UPDATE questionnaires SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING status, closed_at",
            (questionnaire_id,),
        ).fetchone()


def active_questionnaire(connection, token):
    questionnaire = connection.execute(
        "SELECT id, title, description, protocol_version, group_secret, status FROM questionnaires WHERE access_token = %s AND status IN ('active', 'closed') FOR UPDATE",
        (token,),
    ).fetchone()
    if questionnaire is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    return questionnaire


def participation_record(connection, questionnaire, submission_key, *, create=False):
    participation = connection.execute(
        "SELECT id, study_group, current_step, completed_at FROM participations WHERE questionnaire_id = %s AND submission_key = %s FOR UPDATE",
        (questionnaire["id"], submission_key),
    ).fetchone()
    if participation is None and create and questionnaire["status"] == "active":
        digest = hmac.new(
            questionnaire["group_secret"].encode(),
            str(submission_key).encode(),
            hashlib.sha256,
        ).digest()
        group = "experimental" if digest[0] & 1 else "control"
        participation = connection.execute(
            "INSERT INTO participations (questionnaire_id, submission_key, study_group) VALUES (%s, %s, %s) RETURNING id, study_group, current_step, completed_at",
            (questionnaire["id"], submission_key, group),
        ).fetchone()
    if questionnaire["status"] == "closed" and (
        participation is None or participation["completed_at"] is None
    ):
        raise HTTPException(status_code=410, detail="This questionnaire is closed")
    if participation is None:
        raise HTTPException(
            status_code=409, detail="Open this participation before confirming a step"
        )
    return participation


def public_state(questionnaire, questions, participation, submission_key):
    completed = participation["completed_at"] is not None
    return {
        "title": questionnaire["title"],
        "description": questionnaire["description"],
        "protocol_version": questionnaire["protocol_version"],
        "submission_completed": completed,
        "current_step": participation["current_step"],
        "total_steps": len(study_steps(questions)),
        "step": None
        if completed
        else serialize_step(
            questions,
            participation["current_step"],
            submission_key,
            participation["study_group"],
        ),
    }


@public_router.get("/participate/{token}")
def get_public_questionnaire(token: str, submission_key: UUID, response: Response):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        questionnaire = active_questionnaire(connection, token)
        participation = participation_record(
            connection, questionnaire, submission_key, create=True
        )
        questions = read_questions(connection, questionnaire["id"])
        return public_state(questionnaire, questions, participation, submission_key)


def normalized_answer(kind, value):
    if kind == "route_assessment":
        try:
            return RouteAssessment.model_validate(value).model_dump()
        except ValidationError as error:
            raise HTTPException(
                status_code=422,
                detail="Choose a route, enter confidence from 0 to 100, and provide a reason of up to 1000 characters",
            ) from error
    if kind == "likert" and type(value) is int and 1 <= value <= 5:
        return value
    if kind == "route_prediction" and type(value) is int and value in (0, 1):
        return value
    if kind == "explanation" and value is None:
        return None
    raise HTTPException(status_code=422, detail="Invalid answer for this step")


@public_router.post("/participate/{token}/steps/{step}/confirm")
def confirm_step(
    token: str,
    step: Annotated[int, Path(ge=0, le=16)],
    payload: StepConfirmationInput,
    response: Response,
):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        questionnaire = active_questionnaire(connection, token)
        participation = participation_record(
            connection, questionnaire, payload.submission_key
        )
        questions = read_questions(connection, questionnaire["id"])
        steps = study_steps(questions)
        kind, question = steps[step]
        value = normalized_answer(kind, payload.value)
        if step > participation["current_step"]:
            raise HTTPException(
                status_code=409, detail="Complete the current step before continuing"
            )
        if step < participation["current_step"]:
            saved = connection.execute(
                "SELECT value, explanation_completed_at FROM answers WHERE participation_id = %s AND question_id = %s",
                (participation["id"], question["id"]),
            ).fetchone()
            if (
                saved is None
                or (kind == "explanation" and saved["explanation_completed_at"] is None)
                or (kind != "explanation" and saved["value"] != value)
            ):
                raise HTTPException(
                    status_code=409,
                    detail="This step was already confirmed with a different answer",
                )
            return public_state(
                questionnaire, questions, participation, payload.submission_key
            )
        if kind == "explanation":
            connection.execute(
                "UPDATE answers SET explanation_visible_duration_ms = %s, visible_duration_ms = visible_duration_ms + %s, explanation_completed_at = CURRENT_TIMESTAMP WHERE participation_id = %s AND question_id = %s",
                (
                    payload.visible_duration_ms,
                    payload.visible_duration_ms,
                    participation["id"],
                    question["id"],
                ),
            )
        else:
            is_route = kind in {"route_assessment", "route_prediction"}
            connection.execute(
                "INSERT INTO answers (participation_id, question_id, value, route_order, visible_duration_ms, decision_visible_duration_ms) VALUES (%s, %s, %s, %s, %s, %s)",
                (
                    participation["id"],
                    question["id"],
                    Jsonb(value),
                    Jsonb(route_order(payload.submission_key, question["id"]))
                    if is_route
                    else None,
                    payload.visible_duration_ms,
                    payload.visible_duration_ms if is_route else None,
                ),
            )
        participation["current_step"] += 1
        connection.execute(
            "UPDATE participations SET current_step = %s WHERE id = %s",
            (participation["current_step"], participation["id"]),
        )
        return public_state(
            questionnaire, questions, participation, payload.submission_key
        )


@public_router.post("/participate/{token}/submit")
def submit_answers(token: str, payload: SubmissionInput):
    with connect_database() as connection:
        questionnaire = active_questionnaire(connection, token)
        participation = participation_record(
            connection, questionnaire, payload.submission_key
        )
        if participation["completed_at"] is not None:
            return {"status": "completed", "participation_id": participation["id"]}
        if participation["current_step"] != 17:
            raise HTTPException(
                status_code=409, detail="Complete every step before submitting"
            )
        connection.execute(
            "UPDATE participations SET completed_at = CURRENT_TIMESTAMP WHERE id = %s",
            (participation["id"],),
        )
        return {"status": "completed", "participation_id": participation["id"]}
