from datetime import datetime
from pathlib import Path

from .utils import get_project_path

_current_output_directory = get_project_path("results")


def get_output_directory() -> Path:
    return _current_output_directory


def set_output_directory(directory: Path) -> None:
    global _current_output_directory
    _current_output_directory = directory


def experiment_name(
    height: int,
    width: int,
    map_index: int | None = None,
    benchmark: bool = False,
    incremental: bool = False,
    reduction: str = "NONE",
) -> str:
    name = f"experiment-{height}x{width}-{datetime.now():%Y%m%d-%H%M%S}"
    if map_index is not None:
        name += f"-map-{map_index}"
    if benchmark:
        name += f"-{'incremental' if incremental else 'monolithic'}-{reduction.lower()}"
    return name


def available_path(directory: Path, name: str, suffix: str = "") -> Path:
    existing = {entry.name.casefold() for entry in directory.iterdir()}
    index = 1
    while True:
        candidate = f"{name}{f'-{index}' if index > 1 else ''}{suffix}"
        if candidate.casefold() not in existing:
            return directory / candidate
        index += 1


def reserve_output_directory(
    height: int,
    width: int,
    map_index: int | None = None,
    benchmark: bool = False,
    incremental: bool = False,
    reduction: str = "NONE",
) -> Path:
    directory = get_project_path("results")
    directory.mkdir(parents=True, exist_ok=True)
    name = experiment_name(height, width, map_index, benchmark, incremental, reduction)
    while True:
        target = available_path(directory, name)
        try:
            target.mkdir()
            return target
        except FileExistsError:
            continue
