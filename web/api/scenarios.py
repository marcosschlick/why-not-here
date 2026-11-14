from secrets import choice
from typing import Any

from fastapi import APIRouter, HTTPException, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field

from src.grid import Grid
from src.map.profiles import resolve_map_profile
from src.visual.appearance import resolve_map_appearance
from web.api.config_manager import (
    get_experiment_configurations,
    isolated_pipeline_state,
)
from web.api.database import connect_database
from web.api.questionnaires import (
    NonEmptyText,
    get_questionnaire,
    require_draft,
)
from web.api.routes import exclusive_pipeline, generate_map_data, solve_isp_data
from web.api.schemas import GenerateMapRequest, SolveISPRequest
from web.api.study_protocol import (
    resolve_scenario_terrain_colors,
    validate_scenario,
    validate_scenario_configuration,
)

router = APIRouter(prefix="/api/questionnaires", tags=["scenarios"])


class ScenarioInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: NonEmptyText
    configuration: dict[str, Any]
    data: dict[str, Any]


class ScenarioMapInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    height: int = Field(strict=True, ge=4, le=8192)
    width: int = Field(strict=True, ge=4, le=8192)


@router.post("/{questionnaire_id}/scenario-maps")
@exclusive_pipeline
def generate_scenario_map(questionnaire_id: int, payload: ScenarioMapInput):
    with connect_database() as connection:
        questionnaire = require_draft(connection, questionnaire_id)
        count = connection.execute(
            "SELECT count(*) AS total FROM scenarios WHERE questionnaire_id = %s",
            (questionnaire_id,),
        ).fetchone()["total"]
        if count >= 6:
            raise HTTPException(
                status_code=409, detail="All six scenarios are already saved"
            )
        configuration = questionnaire["preparation_configuration"]
        if configuration is None:
            configuration = {
                **get_experiment_configurations(),
                **resolve_map_profile(payload.height, payload.width),
                "MAP_H": payload.height,
                "MAP_W": payload.width,
                "ISP_MODEL": "NORMAL",
                "USE_INCREMENTAL_SOLVER": False,
                "DEFAULT_REDUCTION_METHOD": "NONE",
            }
        elif (configuration["MAP_H"], configuration["MAP_W"]) != (
            payload.height,
            payload.width,
        ):
            raise HTTPException(
                status_code=409,
                detail="Grid size is fixed for this preparation. Create another questionnaire to change it.",
            )
        reserved = connection.execute(
            "SELECT seed FROM scenario_seed_reservations WHERE questionnaire_id = %s",
            (questionnaire_id,),
        ).fetchall()
        used = {row["seed"] for row in reserved}
        available = [42 * number for number in range(1, 101) if 42 * number not in used]
        if not available:
            raise HTTPException(
                status_code=409, detail="All 100 scenario seeds have been reserved"
            )
        seed = choice(available)
        configuration = {**configuration, "MAP_DEFAULT_SEED": seed}
        connection.execute(
            "INSERT INTO scenario_seed_reservations (questionnaire_id, seed) VALUES (%s, %s)",
            (questionnaire_id, seed),
        )
        connection.execute(
            "UPDATE questionnaires SET preparation_configuration = %s WHERE id = %s",
            (Jsonb(configuration), questionnaire_id),
        )
    with isolated_pipeline_state():
        generated = generate_map_data(
            GenerateMapRequest(**configuration, persist_artifacts=False)
        )
    if not generated["optimal_path"]:
        raise HTTPException(
            status_code=422,
            detail=f"Seed {seed} has no optimal route. Generate a replacement.",
        )
    return generated


class ScenarioSolveInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    map: dict[str, Any]
    user_path: list[tuple[int, int]] = Field(min_length=1)
    start: tuple[int, int]
    goal: tuple[int, int]


@router.post("/{questionnaire_id}/scenario-solve")
@exclusive_pipeline
def solve_scenario(questionnaire_id: int, payload: ScenarioSolveInput):
    with connect_database() as connection:
        questionnaire = require_draft(connection, questionnaire_id)
        configuration = questionnaire["preparation_configuration"]
        seed = payload.map.get("base_seed")
        if (
            configuration is None
            or type(seed) is not int
            or not connection.execute(
                "SELECT 1 FROM scenario_seed_reservations WHERE questionnaire_id = %s AND seed = %s",
                (questionnaire_id, seed),
            ).fetchone()
            or (payload.map.get("h"), payload.map.get("w"))
            != (configuration["MAP_H"], configuration["MAP_W"])
        ):
            raise HTTPException(
                status_code=422,
                detail="Use a generated map from this questionnaire preparation",
            )
        configuration = {
            **configuration,
            "MAP_DEFAULT_SEED": seed,
            "ISP_MODEL": "NORMAL",
            "USE_INCREMENTAL_SOLVER": False,
            "DEFAULT_REDUCTION_METHOD": "NONE",
        }
    with isolated_pipeline_state():
        return solve_isp_data(
            SolveISPRequest(**payload.model_dump(), config=configuration)
        )


class ScenarioSummary(BaseModel):
    id: int
    questionnaire_id: int
    title: str


class ScenarioTitleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: NonEmptyText


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
    scenario["terrain_colors"] = resolve_scenario_terrain_colors(
        scenario["configuration"]
    )
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
    except (KeyError, TypeError, ValueError, IndexError) as error:
        raise HTTPException(
            status_code=422, detail="Scenario map is invalid or incomplete"
        ) from error
    validate_scenario(data)
    validate_scenario_configuration(payload.configuration)
    if (
        not isinstance(data.get("solver_status"), str)
        or not data["solver_status"].strip()
    ):
        raise HTTPException(status_code=422, detail="Scenario solver status is missing")
    with connect_database() as connection:
        questionnaire = require_draft(connection, questionnaire_id)
        seed = payload.configuration.get("MAP_DEFAULT_SEED")
        frozen = questionnaire["preparation_configuration"]
        if (
            type(seed) is not int
            or not connection.execute(
                "SELECT 1 FROM scenario_seed_reservations WHERE questionnaire_id = %s AND seed = %s",
                (questionnaire_id, seed),
            ).fetchone()
            or frozen is None
            or payload.configuration != {**frozen, "MAP_DEFAULT_SEED": seed}
            or data["map"].get("base_seed") != seed
            or data.get("requested_seed") != seed
            or (data["map"]["h"], data["map"]["w"])
            != (frozen["MAP_H"], frozen["MAP_W"])
        ):
            raise HTTPException(
                status_code=422,
                detail="Scenario must use a reserved seed and the preparation configuration",
            )
        existing = connection.execute(
            "SELECT id, questionnaire_id, title, configuration, data FROM scenarios WHERE questionnaire_id = %s AND seed = %s",
            (questionnaire_id, seed),
        ).fetchone()
        if existing is not None:
            if (
                existing["configuration"] != payload.configuration
                or existing["data"] != data
            ):
                raise HTTPException(
                    status_code=409,
                    detail="This seed already has a different saved scenario",
                )
            return add_appearance(existing)
        count = connection.execute(
            "SELECT count(*) AS total FROM scenarios WHERE questionnaire_id = %s",
            (questionnaire_id,),
        ).fetchone()["total"]
        if count >= 6:
            raise HTTPException(
                status_code=409, detail="All six scenarios are already saved"
            )
        scenario = connection.execute(
            "INSERT INTO scenarios (questionnaire_id, seed, title, configuration, data) "
            "VALUES (%s, %s, %s, %s, %s) RETURNING id, questionnaire_id, title, configuration, data",
            (
                questionnaire_id,
                seed,
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


@router.patch(
    "/{questionnaire_id}/scenarios/{scenario_id}", response_model=ScenarioSummary
)
def rename_scenario(
    questionnaire_id: int, scenario_id: int, payload: ScenarioTitleInput
):
    with connect_database() as connection:
        require_draft(connection, questionnaire_id)
        scenario = connection.execute(
            "UPDATE scenarios SET title = %s WHERE questionnaire_id = %s AND id = %s "
            "RETURNING id, questionnaire_id, title",
            (payload.title, questionnaire_id, scenario_id),
        ).fetchone()
        if scenario is None:
            raise HTTPException(status_code=404, detail="Scenario not found")
        return scenario


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
