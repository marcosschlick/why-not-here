import re
from pathlib import Path
from typing import Any

from src.pipeline.experiment_config import (
    CONFIG_REGISTRY,
    cast_parameter_value,
    get_all_configurations,
    update_configurations,
)

CONFIG_DIRECTORY = Path(__file__).resolve().parents[2] / "src" / "config"


def persist_parameter_to_file(key: str, value: Any) -> None:
    filename = CONFIG_REGISTRY.get(key)
    if not filename:
        return
    target_file = CONFIG_DIRECTORY / filename
    if not target_file.exists():
        return
    raw_text = target_file.read_text(encoding="utf-8")
    updated_text = re.sub(
        rf"^{re.escape(key)}\s*=.*$",
        f"{key} = {value!r}",
        raw_text,
        flags=re.MULTILINE,
    )
    target_file.write_text(updated_text, encoding="utf-8")
