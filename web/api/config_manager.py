import re
import sys
from pathlib import Path
from typing import Any

from src import config

CONFIG_DIRECTORY = Path(__file__).resolve().parents[2] / "src" / "config"

CONFIG_REGISTRY = {
    "MAP_W": "config_grid.py",
    "MAP_H": "config_grid.py",
    "CELL_SIZE": "config_grid.py",
    "CONNECTIVITY": "config_grid.py",
    "MAP_DEFAULT_SEED": "config_map.py",
    "MAP_ELEVATION_SCALE": "config_map.py",
    "MAP_ELEVATION_FREQ": "config_map.py",
    "MAP_OBSTACLE_FREQ": "config_map.py",
    "MAP_OBSTACLE_THRESHOLD": "config_map.py",
    "DEFAULT_PLANNER": "config_planning.py",
    "TARGET_TERRAIN": "config_isp.py",
    "RHO_TERRAIN": "config_isp.py",
    "RHO_OBSTACLE": "config_isp.py",
    "RHO_SLOPE": "config_isp.py",
    "DEFAULT_SOLVER": "config_solver.py",
    "SOLVER_TIMEOUT_SEC": "config_solver.py",
    "DEFAULT_REDUCTION_METHOD": "config_reduction.py",
    "BBOX_MARGIN": "config_reduction.py",
    "USE_INCREMENTAL_SOLVER": "config_incremental.py",
    "MAX_ISP_ITERATIONS": "config_incremental.py",
    "OUTPUT_DIR": "config_storage.py",
}


def get_all_configurations() -> dict[str, Any]:
    return {
        key: getattr(config, key) for key in CONFIG_REGISTRY if hasattr(config, key)
    }


def cast_parameter_value(current_value: Any, new_value: Any) -> Any:
    if isinstance(current_value, bool) and not isinstance(new_value, bool):
        return str(new_value).lower() in ("true", "1", "yes")
    if isinstance(current_value, int) and not isinstance(new_value, int):
        return int(new_value)
    if isinstance(current_value, float) and not isinstance(new_value, float):
        return float(new_value)
    return new_value


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


def update_configurations(updates: dict[str, Any]) -> dict[str, Any]:
    applied = {}
    for key, raw_val in updates.items():
        if key not in CONFIG_REGISTRY or not hasattr(config, key):
            continue
        current_val = getattr(config, key)
        casted_val = cast_parameter_value(current_val, raw_val)
        setattr(config, key, casted_val)

        submodule_name = CONFIG_REGISTRY[key][:-3]
        if hasattr(config, submodule_name):
            setattr(getattr(config, submodule_name), key, casted_val)

        for mod_name, mod in list(sys.modules.items()):
            if (mod_name == "src.config" or mod_name.startswith("src.")) and hasattr(mod, key):
                setattr(mod, key, casted_val)

        if (
            key == "TARGET_TERRAIN"
            and hasattr(config, "TERRAINS")
            and casted_val in config.TERRAINS
        ):
            target_speed = config.TERRAINS[casted_val]
            config.TARGET_SPEED = target_speed
            if hasattr(config, "config_isp"):
                config.config_isp.TARGET_SPEED = target_speed
            for mod_name, mod in list(sys.modules.items()):
                if (mod_name == "src.config" or mod_name.startswith("src.")) and hasattr(mod, "TARGET_SPEED"):
                    mod.TARGET_SPEED = target_speed

        applied[key] = casted_val
    return applied
