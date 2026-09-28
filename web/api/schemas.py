from typing import Any

from pydantic import BaseModel, Field


class RunRequest(BaseModel):
    runs: int = Field(default=1, ge=1)


class GenerateMapRequest(BaseModel):
    MAP_H: int = Field(default=64, ge=4, le=1024)
    MAP_W: int = Field(default=128, ge=4, le=1024)
    CONNECTIVITY: int = Field(default=8)
    DEFAULT_REDUCTION_METHOD: str = Field(default="NONE")
    USE_INCREMENTAL_SOLVER: bool = Field(default=True)
    OUTPUT_DIR: str = Field(default="output")
    MAP_DEFAULT_SEED: int | None = Field(default=None)
    extra_config: dict[str, Any] | None = None


class SolveISPRequest(BaseModel):
    user_path: list[list[int]] | None = None
    config: dict[str, Any] | None = None
