import re
from datetime import datetime
from pathlib import Path

from .utils import get_project_path


def experiment_name(height: int, width: int) -> str:
    return f"experiment-{height}x{width}-{datetime.now():%Y%m%d-%H%M%S}"


def validate_name(name: str) -> str:
    value = name.strip()
    if (
        not value
        or value in {".", ".."}
        or len(value) > 180
        or re.search(r'[\x00-\x1f/\\<>:"|?*]', value)
    ):
        raise ValueError("Experiment names must be valid file names.")
    return value


def storage_directory(directory: str | Path) -> Path:
    path = get_project_path(Path(directory).expanduser())
    path.mkdir(parents=True, exist_ok=True)
    return path


def available_path(
    directory: Path, name: str, automatic_name: bool, suffix: str = ""
) -> Path:
    name = validate_name(name)
    existing = {entry.name.casefold() for entry in directory.iterdir()}
    index = 1
    while True:
        candidate = f"{name}{f'-{index}' if index > 1 else ''}{suffix}"
        if candidate.casefold() not in existing:
            return directory / candidate
        if not automatic_name:
            raise FileExistsError(
                f"Destination already exists: {directory / candidate}"
            )
        index += 1


def reserve_output_directory(
    height: int,
    width: int,
    directory: str = "results",
    name: str | None = None,
    automatic_name: bool = True,
) -> Path:
    destination = storage_directory(directory or "results")
    selected_name = name or experiment_name(height, width)
    while True:
        target = available_path(destination, selected_name, automatic_name)
        try:
            target.mkdir()
            return target
        except FileExistsError:
            if not automatic_name:
                raise


def reserve_configured_output(height: int, width: int, output_dir: str) -> Path:
    if not output_dir.strip() or output_dir.strip() == "results":
        return reserve_output_directory(height, width)
    path = get_project_path(Path(output_dir).expanduser())
    return reserve_output_directory(height, width, str(path.parent), path.name, False)
