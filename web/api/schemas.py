from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RunRequest(BaseModel):
    runs: int = Field(default=1, ge=1)


class GenerateMapRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    MAP_H: int = Field(default=64, ge=4, le=1024)
    MAP_W: int = Field(default=128, ge=4, le=1024)
    CONNECTIVITY: int = Field(default=8)
    DEFAULT_REDUCTION_METHOD: str = Field(default="NONE")
    USE_INCREMENTAL_SOLVER: bool = Field(default=True)
    INCREMENTAL_ASTAR_SCOPE: str = Field(default="GLOBAL")
    OUTPUT_DIR: str = Field(default="output")
    MAP_DEFAULT_SEED: int | None = Field(default=None)
    persist_artifacts: bool = True
    extra_config: dict[str, Any] | None = None


class SolveISPRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    user_path: list[list[int]] | None = None
    config: dict[str, Any] | None = None


class SemanticModificationsData(BaseModel):
    terrain: int
    obstacle: int
    slope: int
    terrain_nodes: list[tuple[int, int]]
    obstacle_nodes: list[tuple[int, int]]
    slope_edges: list[tuple[tuple[int, int], tuple[int, int]]]


class ExportConfigRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    config: dict[str, Any] | None = None
    start: list[int]
    goal: list[int]
    user_path: list[list[int]]


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

    config: dict[str, Any] | None = None
    start: list[int] | None = None
    goal: list[int] | None = None
    user_path: list[list[int]] | None = None
    p_user: list[list[int]] | None = None
    persist_artifacts: bool = True


class BrowseRequest(BaseModel):
    mode: str = "directory"
    title: str | None = None
