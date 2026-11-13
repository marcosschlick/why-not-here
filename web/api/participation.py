import hashlib
import hmac
import re
import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Response
from psycopg.types.json import Jsonb
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)

from web.api.database import connect_database
from web.api.participation_progress import (
    StepProgress,
    normalized_answer,
    validate_progress,
)
from web.api.questionnaires import get_questionnaire, require_draft
from web.api.study_protocol import (
    read_questions,
    require_protocol,
    route_order,
    scenario_order,
    serialize_step,
    study_steps,
)

router = APIRouter(prefix="/api", tags=["participation"])
public_router = APIRouter(prefix="/api", tags=["participation"])


class SubmissionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    submission_key: UUID


class ParticipationStartInput(SubmissionInput):
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ]
    email: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)
    ]
    key: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ]

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        if not re.fullmatch(r"[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+", value):
            raise ValueError("Enter a valid email address")
        return value.lower()


class KeyBatchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: int = Field(strict=True, ge=1, le=1000)


@router.get("/questionnaires/{questionnaire_id}/participation-keys")
def list_participation_keys(questionnaire_id: int, response: Response):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        get_questionnaire(connection, questionnaire_id)
        return connection.execute(
            "SELECT k.key, k.created_at, p.id IS NOT NULL AS used FROM participation_keys k "
            "LEFT JOIN participations p ON p.questionnaire_id = k.questionnaire_id AND p.participation_key = k.key "
            "WHERE k.questionnaire_id = %s ORDER BY k.created_at, k.key",
            (questionnaire_id,),
        ).fetchall()


@router.post("/questionnaires/{questionnaire_id}/participation-keys", status_code=201)
def generate_participation_keys(
    questionnaire_id: int, payload: KeyBatchInput, response: Response
):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        questionnaire = get_questionnaire(connection, questionnaire_id, lock=True)
        if questionnaire["status"] == "closed":
            raise HTTPException(status_code=409, detail="This questionnaire is closed")
        keys = []
        while len(keys) < payload.quantity:
            key = secrets.token_urlsafe(18)
            created = connection.execute(
                "INSERT INTO participation_keys (questionnaire_id, key) VALUES (%s, %s) "
                "ON CONFLICT DO NOTHING RETURNING key, created_at",
                (questionnaire_id, key),
            ).fetchone()
            if created is not None:
                keys.append({**created, "used": False})
        return keys


class StepProgressInput(SubmissionInput):
    revision: int = Field(strict=True, ge=0)
    progress: StepProgress


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
        return {"status": "active"}


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


def participation_record(connection, questionnaire, submission_key):
    participation = connection.execute(
        "SELECT id, study_group, scenario_order, current_step, completed_at, draft, draft_revision FROM participations WHERE questionnaire_id = %s AND submission_key = %s FOR UPDATE",
        (questionnaire["id"], submission_key),
    ).fetchone()
    if questionnaire["status"] == "closed" and (
        participation is None or participation["completed_at"] is None
    ):
        raise HTTPException(status_code=410, detail="This questionnaire is closed")
    if participation is None:
        raise HTTPException(
            status_code=401,
            detail="Start participation with your name, email and individual key",
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
        "total_steps": len(study_steps(questions, participation["scenario_order"])),
        "draft": participation["draft"],
        "draft_revision": participation["draft_revision"],
        "step": None
        if completed
        else serialize_step(
            questions,
            participation["current_step"],
            submission_key,
            participation["study_group"],
            participation["scenario_order"],
        ),
    }


@public_router.post("/participate/start")
def start_participation(payload: ParticipationStartInput, response: Response):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        target = connection.execute(
            "SELECT q.access_token FROM questionnaires q JOIN participation_keys k ON k.questionnaire_id = q.id "
            "WHERE k.key = %s AND q.access_token IS NOT NULL",
            (payload.key,),
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=401, detail="Invalid participation key")
        token = target["access_token"]
        questionnaire = active_questionnaire(connection, token)
        existing = connection.execute(
            "SELECT participant_name, participant_email, submission_key FROM participations "
            "WHERE questionnaire_id = %s AND participation_key = %s FOR UPDATE",
            (questionnaire["id"], payload.key),
        ).fetchone()
        submission_key = payload.submission_key
        if existing is not None:
            if (existing["participant_name"], existing["participant_email"]) != (
                payload.name,
                payload.email,
            ):
                raise HTTPException(
                    status_code=401,
                    detail="Name, email and individual key must match the original participation",
                )
            submission_key = existing["submission_key"]
        else:
            if questionnaire["status"] != "active":
                raise HTTPException(
                    status_code=410, detail="This questionnaire is closed"
                )
            if connection.execute(
                "SELECT 1 FROM participations WHERE questionnaire_id = %s AND "
                "(participant_email = %s OR submission_key = %s)",
                (questionnaire["id"], payload.email, submission_key),
            ).fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="This email or session already belongs to another participation",
                )
            questions = read_questions(connection, questionnaire["id"])
            require_protocol(questions)
            digest = hmac.new(
                questionnaire["group_secret"].encode(),
                str(submission_key).encode(),
                hashlib.sha256,
            ).digest()
            group = "experimental" if digest[0] & 1 else "control"
            connection.execute(
                "INSERT INTO participations (questionnaire_id, submission_key, participant_name, participant_email, participation_key, study_group, scenario_order) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (
                    questionnaire["id"],
                    submission_key,
                    payload.name,
                    payload.email,
                    payload.key,
                    group,
                    Jsonb(scenario_order(questions, submission_key)),
                ),
            )
        participation = participation_record(connection, questionnaire, submission_key)
        return {
            **public_state(
                questionnaire,
                read_questions(connection, questionnaire["id"]),
                participation,
                submission_key,
            ),
            "access_token": token,
            "submission_key": submission_key,
        }


@public_router.get("/participate/{token}")
def get_public_questionnaire(token: str, submission_key: UUID, response: Response):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        questionnaire = active_questionnaire(connection, token)
        participation = participation_record(connection, questionnaire, submission_key)
        questions = read_questions(connection, questionnaire["id"])
        return public_state(questionnaire, questions, participation, submission_key)


def current_step(questions, participation, index):
    steps = study_steps(questions, participation["scenario_order"])
    if index >= len(steps):
        raise HTTPException(status_code=422, detail="Invalid study step")
    return steps[index]


def require_revision(participation, revision):
    if revision != participation["draft_revision"]:
        raise HTTPException(
            status_code=409,
            detail="Progress changed in another session. Reload this questionnaire before continuing.",
        )


@public_router.put("/participate/{token}/steps/{step}/draft")
def save_step_draft(
    token: str,
    step: Annotated[int, Path(ge=0)],
    payload: StepProgressInput,
    response: Response,
):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        questionnaire = active_questionnaire(connection, token)
        participation = participation_record(
            connection, questionnaire, payload.submission_key
        )
        if (
            participation["completed_at"] is not None
            or step != participation["current_step"]
        ):
            raise HTTPException(
                status_code=409, detail="Only the current unfinished step can be saved"
            )
        questions = read_questions(
            connection, questionnaire["id"], include_scenarios=False
        )
        kind, _ = current_step(questions, participation, step)
        draft = payload.progress.model_dump()
        if participation["draft"] == draft:
            return {"draft_revision": participation["draft_revision"]}
        require_revision(participation, payload.revision)
        validate_progress(kind, payload.progress, participation["draft"])
        return connection.execute(
            "UPDATE participations SET draft = %s, draft_revision = draft_revision + 1 "
            "WHERE id = %s RETURNING draft_revision",
            (Jsonb(draft), participation["id"]),
        ).fetchone()


@public_router.post("/participate/{token}/steps/{step}/confirm")
def confirm_step(
    token: str,
    step: Annotated[int, Path(ge=0)],
    payload: StepProgressInput,
    response: Response,
):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        questionnaire = active_questionnaire(connection, token)
        participation = participation_record(
            connection, questionnaire, payload.submission_key
        )
        questions = read_questions(connection, questionnaire["id"])
        kind, question = current_step(questions, participation, step)
        value = normalized_answer(kind, payload.progress.value)
        if step > participation["current_step"]:
            raise HTTPException(
                status_code=409, detail="Complete the current step before continuing"
            )
        if step < participation["current_step"]:
            saved = connection.execute(
                "SELECT value, post_explanation_reason FROM answers WHERE participation_id = %s AND question_id = %s",
                (participation["id"], question["id"]),
            ).fetchone()
            previous = (
                (
                    {"reason": saved["post_explanation_reason"]}
                    if kind == "explanation"
                    else saved["value"]
                )
                if saved
                else None
            )
            if previous != value:
                raise HTTPException(
                    status_code=409,
                    detail="This step was already confirmed with a different answer",
                )
            return public_state(
                questionnaire, questions, participation, payload.submission_key
            )
        require_revision(participation, payload.revision)
        value = validate_progress(
            kind, payload.progress, participation["draft"], complete=True
        )
        progress = payload.progress
        if kind == "explanation":
            connection.execute(
                "UPDATE answers SET post_explanation_reason = %s, explanation_visible_duration_ms = %s, "
                "visible_duration_ms = visible_duration_ms + %s, explanation_completed_at = CURRENT_TIMESTAMP "
                "WHERE participation_id = %s AND question_id = %s",
                (
                    value["reason"],
                    progress.visible_duration_ms,
                    progress.visible_duration_ms,
                    participation["id"],
                    question["id"],
                ),
            )
        else:
            is_route = kind in {"route_assessment", "route_prediction"}
            connection.execute(
                "INSERT INTO answers (participation_id, question_id, value, route_order, visible_duration_ms, "
                "decision_visible_duration_ms, first_selection_visible_duration_ms, final_selection_visible_duration_ms, choice_changed) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    participation["id"],
                    question["id"],
                    Jsonb(value),
                    Jsonb(route_order(payload.submission_key, question["id"]))
                    if is_route
                    else None,
                    progress.visible_duration_ms,
                    progress.decision_visible_duration_ms,
                    progress.first_selection_visible_duration_ms,
                    progress.final_selection_visible_duration_ms,
                    progress.choice_changed if is_route else None,
                ),
            )
        participation["current_step"] += 1
        participation["draft"] = None
        participation["draft_revision"] += 1
        connection.execute(
            "UPDATE participations SET current_step = %s, draft = NULL, draft_revision = %s WHERE id = %s",
            (
                participation["current_step"],
                participation["draft_revision"],
                participation["id"],
            ),
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
        questions = read_questions(
            connection, questionnaire["id"], include_scenarios=False
        )
        if participation["current_step"] != len(
            study_steps(questions, participation["scenario_order"])
        ):
            raise HTTPException(
                status_code=409, detail="Complete every step before submitting"
            )
        connection.execute(
            "UPDATE participations SET completed_at = CURRENT_TIMESTAMP WHERE id = %s",
            (participation["id"],),
        )
        return {"status": "completed", "participation_id": participation["id"]}
