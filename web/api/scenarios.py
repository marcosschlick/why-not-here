import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field

from src.pipeline.experiment_config import (
    EXPERIMENT_CONFIG_REGISTRY,
    get_all_configurations,
)
from web.api.database import connect_database
from web.api.questionnaires import NonEmptyText, get_questionnaire, require_draft

router = APIRouter(prefix="/api/questionnaires", tags=["scenarios"])
ROOT_DIR = Path(__file__).resolve().parents[2]


class ScenarioInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: NonEmptyText
    config: dict[str, Any] = Field(default_factory=dict)
    start: tuple[int, int] | None = None
    goal: tuple[int, int] | None = None
    alternative_path: list[tuple[int, int]] | None = Field(default=None, min_length=1)


class ScenarioSummary(BaseModel):
    id: int
    questionnaire_id: int
    title: str


class ScenarioDetails(ScenarioSummary):
    configuration: dict[str, Any] = Field(
        description="Effective generation and solver configuration"
    )
    data: dict[str, Any] = Field(
        description="Saved maps, endpoints, paths, costs, explanations, modifications, and solver status"
    )


@router.post(
    "/{questionnaire_id}/scenarios",
    status_code=status.HTTP_201_CREATED,
    response_model=ScenarioDetails,
)
def create_scenario(questionnaire_id: int, payload: ScenarioInput):
    with connect_database() as connection:
        require_draft(connection, questionnaire_id)
    if "OUTPUT_DIR" in payload.config:
        raise HTTPException(
            status_code=422, detail="OUTPUT_DIR cannot be set for scenario generation"
        )
    current = get_all_configurations()
    configuration = {
        key: current[key] for key in EXPERIMENT_CONFIG_REGISTRY if key in current
    }
    request = {
        "configuration": configuration,
        "overrides": payload.config,
        "start": payload.start,
        "goal": payload.goal,
        "alternative_path": payload.alternative_path,
    }
    with tempfile.TemporaryDirectory(prefix="tcc-scenario-") as directory:
        request_path = Path(directory) / "request.json"
        result_path = Path(directory) / "result.json"
        request_path.write_text(json.dumps(request), encoding="utf-8")
        process = subprocess.run(
            [
                sys.executable,
                "-B",
                "-m",
                "web.api.scenario_worker",
                str(request_path),
                str(result_path),
            ],
            cwd=ROOT_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        if process.returncode != 0 or not result_path.exists():
            raise HTTPException(status_code=500, detail="Scenario generation failed")
        result = json.loads(result_path.read_text(encoding="utf-8"))
    if "error" in result:
        status_code = (
            422
            if result["status"] in {"INVALID_INPUT", "INVALID_ALTERNATIVE_PATH"}
            else 409
        )
        raise HTTPException(
            status_code=status_code,
            detail={"status": result["status"], "message": result["error"]},
        )
    with connect_database() as connection:
        require_draft(connection, questionnaire_id)
        return connection.execute(
            "INSERT INTO scenarios (questionnaire_id, title, configuration, data) "
            "VALUES (%s, %s, %s, %s) RETURNING id, questionnaire_id, title, configuration, data",
            (
                questionnaire_id,
                payload.title,
                Jsonb(result["configuration"]),
                Jsonb(result["data"]),
            ),
        ).fetchone()


@router.get("/{questionnaire_id}/scenarios", response_model=list[ScenarioSummary])
def list_scenarios(questionnaire_id: int):
    with connect_database() as connection:
        get_questionnaire(connection, questionnaire_id)
        return connection.execute(
            "SELECT id, questionnaire_id, title FROM scenarios WHERE questionnaire_id = %s ORDER BY id",
            (questionnaire_id,),
        ).fetchall()


@router.get(
    "/{questionnaire_id}/scenarios/{scenario_id}", response_model=ScenarioDetails
)
def read_scenario(questionnaire_id: int, scenario_id: int):
    with connect_database() as connection:
        get_questionnaire(connection, questionnaire_id)
        scenario = connection.execute(
            "SELECT id, questionnaire_id, title, configuration, data FROM scenarios "
            "WHERE questionnaire_id = %s AND id = %s",
            (questionnaire_id, scenario_id),
        ).fetchone()
        if scenario is None:
            raise HTTPException(status_code=404, detail="Scenario not found")
        return scenario
