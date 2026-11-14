from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from psycopg import errors
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, StringConstraints

from web.api.database import connect_database
from web.api.questionnaire_export import export_rows, read_export_answers, render_csv
from web.api.questionnaire_results import (
    aggregate_results,
    participation_counts,
    read_completed_answers,
)
from web.api.study_protocol import (
    PROTOCOL_VERSION,
    StudyGroup,
    build_questions,
    protocol_selection,
    read_questions,
    require_protocol,
    scenario_order,
    serialize_step,
    study_steps,
    validate_scenario,
    validate_scenario_configuration,
)

router = APIRouter(prefix="/api/questionnaires", tags=["questionnaires"])
NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class QuestionnaireInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: NonEmptyText
    description: str | None = None


def get_questionnaire(connection, questionnaire_id: int, *, lock: bool = False):
    query = "SELECT id, title, description, status, protocol_version, created_at, closed_at, preparation_configuration, next_scenario_seed FROM questionnaires WHERE id = %s"
    if lock:
        query += " FOR UPDATE"
    questionnaire = connection.execute(query, (questionnaire_id,)).fetchone()
    if questionnaire is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    return questionnaire


def require_draft(connection, questionnaire_id: int):
    questionnaire = get_questionnaire(connection, questionnaire_id, lock=True)
    if questionnaire["status"] != "draft":
        raise HTTPException(status_code=409, detail="Questionnaire is not a draft")
    return questionnaire


def questionnaire_details(connection, questionnaire_id):
    questionnaire = get_questionnaire(connection, questionnaire_id)
    questions = read_questions(connection, questionnaire_id)
    questionnaire["questions"] = [
        {
            key: question[key]
            for key in (
                "id",
                "prompt",
                "type",
                "configuration",
                "scenario_id",
                "position",
            )
        }
        for question in questions
    ]
    return questionnaire


@router.post("", status_code=status.HTTP_201_CREATED)
def create_questionnaire(payload: QuestionnaireInput):
    with connect_database() as connection:
        return connection.execute(
            "INSERT INTO questionnaires (title, description, protocol_version) VALUES (%s, %s, %s) "
            "RETURNING id, title, description, status, protocol_version, created_at",
            (payload.title, payload.description, PROTOCOL_VERSION),
        ).fetchone()


@router.get("")
def list_questionnaires():
    with connect_database() as connection:
        return connection.execute(
            "SELECT id, title, description, status, protocol_version, created_at FROM questionnaires ORDER BY id"
        ).fetchall()


@router.get("/{questionnaire_id}")
def read_questionnaire(questionnaire_id: int):
    with connect_database() as connection:
        return questionnaire_details(connection, questionnaire_id)


@router.get("/{questionnaire_id}/participation-summary")
def read_participation_summary(questionnaire_id: int, response: Response):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        get_questionnaire(connection, questionnaire_id)
        counts = participation_counts(connection, questionnaire_id)
        return {key: counts[key] for key in ("total", "completed", "in_progress")}


@router.get("/{questionnaire_id}/results")
def read_questionnaire_results(questionnaire_id: int, response: Response):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        questionnaire = get_questionnaire(connection, questionnaire_id)
        if questionnaire["status"] not in {"active", "closed"}:
            raise HTTPException(
                status_code=409,
                detail="Results are available for active or closed questionnaires",
            )
        questions = read_questions(
            connection, questionnaire_id, include_scenarios=False
        )
        scenario_ids = {
            q["scenario_id"] for q in questions if q["type"] == "route_scenario"
        }
        return aggregate_results(
            participation_counts(connection, questionnaire_id),
            scenario_ids,
            read_completed_answers(connection, questionnaire_id),
        )


@router.get("/{questionnaire_id}/responses.csv")
def download_responses(questionnaire_id: int):
    with connect_database() as connection:
        connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        questionnaire = get_questionnaire(connection, questionnaire_id)
        if questionnaire["status"] not in {"active", "closed"}:
            raise HTTPException(
                status_code=409,
                detail="CSV export is available for active or closed questionnaires",
            )
        content = render_csv(
            export_rows(
                questionnaire_id, read_export_answers(connection, questionnaire_id)
            )
        )
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'attachment; filename="questionnaire-{questionnaire_id}-responses.csv"',
        },
    )


@router.put("/{questionnaire_id}")
def update_questionnaire(questionnaire_id: int, payload: QuestionnaireInput):
    with connect_database() as connection:
        require_draft(connection, questionnaire_id)
        return connection.execute(
            "UPDATE questionnaires SET title = %s, description = %s WHERE id = %s "
            "RETURNING id, title, description, status, protocol_version, created_at",
            (payload.title, payload.description, questionnaire_id),
        ).fetchone()


@router.put("/{questionnaire_id}/protocol")
async def save_protocol(questionnaire_id: int, request: Request):
    if await request.body():
        raise HTTPException(
            status_code=422, detail="Protocol request must not contain a body"
        )
    with connect_database() as connection:
        require_draft(connection, questionnaire_id)
        scenarios = connection.execute(
            "SELECT id, data, configuration FROM scenarios WHERE questionnaire_id = %s ORDER BY id",
            (questionnaire_id,),
        ).fetchall()
        if len(scenarios) != 6:
            raise HTTPException(
                status_code=422, detail="Study requires six saved scenarios"
            )
        for scenario in scenarios:
            validate_scenario(scenario["data"])
            validate_scenario_configuration(scenario["configuration"])
        ids = [scenario["id"] for scenario in scenarios]
        existing = read_questions(connection, questionnaire_id)
        if protocol_selection(existing)["scenario_ids"] != ids:
            connection.execute(
                "DELETE FROM questions WHERE questionnaire_id = %s", (questionnaire_id,)
            )
            for question in build_questions(ids):
                connection.execute(
                    "INSERT INTO questions (questionnaire_id, prompt, type, configuration, scenario_id, position) VALUES (%s, %s, %s, %s, %s, %s)",
                    (
                        questionnaire_id,
                        question["prompt"],
                        question["type"],
                        Jsonb(question["configuration"]),
                        question["scenario_id"],
                        question["position"],
                    ),
                )
        require_protocol(read_questions(connection, questionnaire_id))
        return questionnaire_details(connection, questionnaire_id)


@router.get("/{questionnaire_id}/preview")
def preview_questionnaire(
    questionnaire_id: int,
    group: StudyGroup,
    submission_key: UUID,
    step: Annotated[int, Query(ge=0)] = 0,
):
    with connect_database() as connection:
        questionnaire = get_questionnaire(connection, questionnaire_id)
        questions = read_questions(connection, questionnaire_id)
        require_protocol(questions)
        order = scenario_order(questions, submission_key)
        return {
            "title": questionnaire["title"],
            "description": questionnaire["description"],
            "protocol_version": questionnaire["protocol_version"],
            "submission_completed": False,
            "current_step": step,
            "total_steps": len(study_steps(questions, order)),
            "draft": None,
            "draft_revision": 0,
            "step": serialize_step(questions, step, submission_key, group, order),
        }


@router.delete("/{questionnaire_id}", status_code=204)
def delete_questionnaire(questionnaire_id: int):
    try:
        with connect_database() as connection:
            get_questionnaire(connection, questionnaire_id, lock=True)
            if connection.execute(
                "SELECT 1 FROM participations WHERE questionnaire_id = %s LIMIT 1",
                (questionnaire_id,),
            ).fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="Questionnaire has recorded participations and cannot be deleted",
                )
            connection.execute(
                "DELETE FROM questions WHERE questionnaire_id = %s", (questionnaire_id,)
            )
            connection.execute(
                "DELETE FROM scenarios WHERE questionnaire_id = %s", (questionnaire_id,)
            )
            connection.execute(
                "DELETE FROM participation_keys WHERE questionnaire_id = %s",
                (questionnaire_id,),
            )
            connection.execute(
                "DELETE FROM questionnaires WHERE id = %s", (questionnaire_id,)
            )
    except errors.ForeignKeyViolation as error:
        raise HTTPException(
            status_code=409, detail="Questionnaire has linked records"
        ) from error
    return Response(status_code=204)
