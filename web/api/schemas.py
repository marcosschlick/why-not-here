from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RunRequest(BaseModel):
    runs: int = Field(default=1, ge=1)


class GenerateMapRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    MAP_H: int = Field(default=64, ge=4, le=1024)
    MAP_W: int = Field(default=128, ge=4, le=1024)
    CONNECTIVITY: int = Field(default=8)
    CELL_SIZE: float | None = Field(default=None, gt=0)
    DEFAULT_REDUCTION_METHOD: str = Field(default="NONE")
    USE_INCREMENTAL_SOLVER: bool = Field(default=False)
    INCREMENTAL_ASTAR_SCOPE: str = Field(default="GLOBAL")
    OUTPUT_DIR: str = Field(default="")
    MAP_DEFAULT_SEED: int | None = Field(default=None)
    MAP_ELEVATION_SCALE: float | None = Field(default=None, gt=0)
    MAP_ELEVATION_FREQ: float | None = Field(default=None, gt=0)
    MAP_ELEVATION_OCTAVES: int | None = Field(default=None, ge=1)
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


class SolveISPRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    user_path: list[tuple[int, int]] | None = None
    config: dict[str, Any] | None = None
    start: tuple[int, int] | None = None
    goal: tuple[int, int] | None = None


class SemanticModificationsData(BaseModel):
    terrain: int
    obstacle: int
    slope: int
    water: int = 0
    terrain_nodes: list[tuple[int, int]]
    obstacle_nodes: list[tuple[int, int]]
    slope_edges: list[tuple[tuple[int, int], tuple[int, int]]]
    water_nodes: list[tuple[int, int]] = Field(default_factory=list)


class ExportConfigRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    config: dict[str, Any] | None = None
    start: tuple[int, int]
    goal: tuple[int, int]
    user_path: list[tuple[int, int]]


class SaveConfigItem(BaseModel):
    name: str
    config: dict[str, Any] | None = None
    start: tuple[int, int]
    goal: tuple[int, int]
    user_path: list[tuple[int, int]]


class SaveConfigurationsRequest(BaseModel):
    destination_dir: str
    configurations: list[SaveConfigItem] = Field(min_length=1)


class ImportConfigRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    start: tuple[int, int]
    goal: tuple[int, int]
    p_user: list[tuple[int, int]] = Field(min_length=1)
    persist_artifacts: bool = True


class BrowseRequest(BaseModel):
    mode: str = "directory"
    title: str | None = None
