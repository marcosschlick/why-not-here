from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.grid.interventions import CellOpening, SlopeAdjustment, SpeedIntervention


class NamingMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    map_index: int | None = Field(default=None, ge=1)
    benchmark: bool = False
    benchmark_member: bool = False
    batch_name: str | None = Field(
        default=None, pattern=r"^batch-[0-9]{8}-[0-9]{6}(?:-[0-9]+)?$", max_length=40
    )
    benchmark_group_id: str | None = Field(default=None, max_length=128)


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    runs: int = Field(default=1, ge=1)


class ScenarioPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: dict[str, Any]
    benchmark: bool = False
    purpose: Literal["run", "create"] = "run"


class GenerateMapRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    MAP_H: int = Field(default=64, ge=4, le=8192)
    MAP_W: int = Field(default=128, ge=4, le=8192)
    CONNECTIVITY: int = Field(default=8)
    CELL_SIZE: float | None = Field(default=None, gt=0)
    DEFAULT_REDUCTION_METHOD: str = Field(default="NONE")
    USE_INCREMENTAL_SOLVER: bool = Field(default=False)
    INCREMENTAL_ASTAR_SCOPE: str = Field(default="GLOBAL")
    MAP_DEFAULT_SEED: int | None = Field(default=None)
    MAP_ELEVATION_SCALE: float | None = Field(default=None, gt=0)
    MAP_ELEVATION_FREQ: float | None = Field(default=None, gt=0)
    MAP_ELEVATION_OCTAVES: int | None = Field(default=None, ge=1)
    MAP_ELEVATION_PERSISTENCE: float | None = Field(default=None, gt=0, le=1)
    MAP_MOISTURE_FREQ: float | None = Field(default=None, gt=0)
    MAP_MOISTURE_OCTAVES: int | None = Field(default=None, ge=1)
    MAP_ROUGHNESS_FREQ: float | None = Field(default=None, gt=0)
    MAP_ROUGHNESS_OCTAVES: int | None = Field(default=None, ge=1)
    MAP_TERRAIN_THRESHOLDS: dict[str, float] | None = None
    MAP_ROUGHNESS_THRESHOLDS: dict[str, float] | None = None
    MAP_MIN_MAIN_COMPONENT_RATIO: float | None = Field(default=None, gt=0, le=1)
    MAP_MAX_GENERATION_ATTEMPTS: int | None = Field(default=None, ge=1)
    persist_artifacts: bool = True
    extra_config: dict[str, Any] | None = None


class ExecutionMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str = Field(min_length=1, max_length=128)
    benchmark_group_id: str | None = Field(default=None, max_length=128)
    attempt_index: int = Field(default=1, ge=1)
    execution_order: int = Field(default=1, ge=1)
    map_generation_sec: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class SolveISPRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    execution: ExecutionMetadata | None = None
    user_path: list[tuple[int, int]] | None = None
    map: dict[str, Any] | None = None
    config: dict[str, Any] | None = None
    start: tuple[int, int] | None = None
    goal: tuple[int, int] | None = None
    naming: NamingMetadata | None = None


class SemanticModificationsData(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    model: Literal["NORMAL", "BRANDAO"]
    terrain: int = Field(ge=0)
    cell_opening: int = Field(ge=0)
    slope: int = Field(ge=0)
    environmental_speed: int = Field(ge=0)
    robot_capability: int = Field(ge=0)
    terrain_nodes: list[tuple[int, int]]
    terrain_assignments: list[tuple[tuple[int, int], str]]
    cell_openings: list[CellOpening]
    slope_adjustments: list[SlopeAdjustment]
    environmental_speed_edges: list[SpeedIntervention]
    robot_capability_edges: list[SpeedIntervention]

    @model_validator(mode="before")
    @classmethod
    def validate_records(cls, data):
        try:
            for name, record_type in (
                ("cell_openings", CellOpening),
                ("slope_adjustments", SlopeAdjustment),
                ("environmental_speed_edges", SpeedIntervention),
                ("robot_capability_edges", SpeedIntervention),
            ):
                for record in data[name]:
                    record_type(**record)
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError("Invalid or incompatible intervention records.") from error
        return data

    @model_validator(mode="after")
    def validate_categories(self):
        from src.isp.types import SemanticModifications

        SemanticModifications(
            model=self.model,
            terrain_nodes=self.terrain_nodes,
            terrain_assignments=self.terrain_assignments,
            cell_openings=self.cell_openings,
            slope_adjustments=self.slope_adjustments,
            environmental_speed_edges=self.environmental_speed_edges,
            robot_capability_edges=self.robot_capability_edges,
        )
        for count, records in (
            (self.terrain, self.terrain_nodes),
            (self.cell_opening, self.cell_openings),
            (self.slope, self.slope_adjustments),
            (self.environmental_speed, self.environmental_speed_edges),
            (self.robot_capability, self.robot_capability_edges),
        ):
            if count != len(records):
                raise ValueError("Intervention counts do not match their records.")
        return self


class ExportConfigRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: dict[str, Any] | None = None
    start: tuple[int, int]
    goal: tuple[int, int]
    user_path: list[tuple[int, int]]


class SaveConfigItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    naming: NamingMetadata | None = None
    config: dict[str, Any] | None = None
    start: tuple[int, int]
    goal: tuple[int, int]
    user_path: list[tuple[int, int]]


class SaveConfigurationsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    batch: bool = False
    configurations: list[SaveConfigItem] = Field(min_length=1)


class ImportConfigRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    start: tuple[int, int]
    goal: tuple[int, int]
    p_user: list[tuple[int, int]] = Field(min_length=1)
    persist_artifacts: bool = True
