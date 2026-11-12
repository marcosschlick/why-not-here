import os
import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from web.api.database import connect_database
from web.api.study_protocol import ESS_SOURCE, ESS_TITLE, protocol_selection

router = APIRouter(prefix="/api/questionnaires", tags=["exports"])


@router.get("/{questionnaire_id}/export")
def export_questionnaire(
    questionnaire_id: int, x_export_key: Annotated[str | None, Header()] = None
):
    configured_key = os.getenv("ADMIN_EXPORT_KEY", "")
    if not configured_key:
        raise HTTPException(status_code=503, detail="Export key is not configured")
    if x_export_key is None or not secrets.compare_digest(
        x_export_key.encode(), configured_key.encode()
    ):
        raise HTTPException(status_code=401, detail="Invalid export key")
    with connect_database() as connection:
        connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        questionnaire = connection.execute(
            "SELECT id, title, description, status, protocol_version, created_at, closed_at FROM questionnaires WHERE id = %s",
            (questionnaire_id,),
        ).fetchone()
        if questionnaire is None:
            raise HTTPException(status_code=404, detail="Questionnaire not found")
        questions = connection.execute(
            "SELECT id, scenario_id, prompt, type, configuration, position FROM questions WHERE questionnaire_id = %s ORDER BY position, id",
            (questionnaire_id,),
        ).fetchall()
        scenarios = connection.execute(
            "SELECT id, title, configuration, data FROM scenarios WHERE questionnaire_id = %s ORDER BY id",
            (questionnaire_id,),
        ).fetchall()
        participations = connection.execute(
            "SELECT id, study_group, started_at, completed_at FROM participations WHERE questionnaire_id = %s AND completed_at IS NOT NULL ORDER BY id",
            (questionnaire_id,),
        ).fetchall()
        answers = connection.execute(
            "SELECT a.participation_id, a.question_id, a.value, a.route_order, a.confirmed_at, a.explanation_completed_at, a.visible_duration_ms, a.decision_visible_duration_ms, a.explanation_visible_duration_ms FROM answers a JOIN participations p ON p.id = a.participation_id WHERE p.questionnaire_id = %s AND p.completed_at IS NOT NULL ORDER BY a.participation_id, a.id",
            (questionnaire_id,),
        ).fetchall()
        answers_by_participation = {item["id"]: [] for item in participations}
        for answer in answers:
            answers_by_participation[answer["participation_id"]].append(answer)
        for participation in participations:
            participation["answers"] = answers_by_participation[participation["id"]]
        export = {
            "protocol": protocol_selection(questions),
            "instrument": {
                "name": ESS_TITLE,
                "source": ESS_SOURCE,
                "adapted": True,
                "validated_adaptation": False,
            },
            "questionnaire": questionnaire,
            "questions": questions,
            "scenarios": scenarios,
            "participations": participations,
            "timing_fields": {
                "visible_duration_ms": "Accumulated milliseconds the question was displayed while the browser tab was visible; null when unavailable",
                "decision_visible_duration_ms": "Visible milliseconds for the route decision, confidence and reason (assessment), or route choice (prediction), excluding network wait",
                "explanation_visible_duration_ms": "Accumulated visible milliseconds while the explanation was displayed; included in question viewing time; null when unavailable",
                "started_at": "Server time when the participation was opened",
            },
        }
        return JSONResponse(
            content=jsonable_encoder(export),
            headers={
                "Content-Disposition": f'attachment; filename="questionnaire-{questionnaire_id}.json"',
                "Cache-Control": "no-store",
            },
        )
