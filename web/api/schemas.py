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
    OUTPUT_DIR: str = Field(default="output")
    MAP_DEFAULT_SEED: int | None = Field(default=None)
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
