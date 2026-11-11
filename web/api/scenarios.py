from typing import Any

from fastapi import APIRouter, HTTPException, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field

from src.grid import Grid
from src.visual.appearance import resolve_map_appearance
from web.api.database import connect_database
from web.api.participation import resolve_scenario_terrain_colors, validate_route
from web.api.questionnaires import (
    NonEmptyText,
    get_questionnaire,
    require_draft,
    valid_drawing_scenario,
)

router = APIRouter(prefix="/api/questionnaires", tags=["scenarios"])


class ScenarioInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: NonEmptyText
    configuration: dict[str, Any]
    data: dict[str, Any]


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
    appearance: dict[str, Any] | None = None
    terrain_colors: dict[str, str]


def add_appearance(scenario):
    scenario["terrain_colors"] = resolve_scenario_terrain_colors(scenario["configuration"])
    grid = scenario["data"].get("map")
    if (
        isinstance(grid, dict)
        and type(grid.get("h")) is int
        and type(grid.get("w")) is int
        and grid["h"] > 0
        and grid["w"] > 0
    ):
        scenario["appearance"] = resolve_map_appearance(grid["h"], grid["w"])
    else:
        scenario["appearance"] = None
    return scenario


@router.post(
    "/{questionnaire_id}/scenarios",
    status_code=status.HTTP_201_CREATED,
    response_model=ScenarioDetails,
)
def create_scenario(questionnaire_id: int, payload: ScenarioInput):
    data = payload.data
    try:
        Grid.from_dict(data["map"])
        valid = (
            valid_drawing_scenario(data)
            and all(
                validate_route(data[key], data)
                for key in ("optimal_path", "alternative_path")
            )
            and data.get("success") is True
            and all(
                isinstance(data.get(key), str) and data[key].strip()
                for key in ("solver_status", "explanation_text", "cost_baseline_text")
            )
        )
    except (KeyError, TypeError, ValueError, IndexError):
        valid = False
    if not valid:
        raise HTTPException(
            status_code=422, detail="Scenario data is invalid or incomplete"
        )
    with connect_database() as connection:
        require_draft(connection, questionnaire_id)
        scenario = connection.execute(
            "INSERT INTO scenarios (questionnaire_id, title, configuration, data) "
            "VALUES (%s, %s, %s, %s) RETURNING id, questionnaire_id, title, configuration, data",
            (
                questionnaire_id,
                payload.title,
                Jsonb(payload.configuration),
                Jsonb(data),
            ),
        ).fetchone()
        return add_appearance(scenario)


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
        return add_appearance(scenario)
