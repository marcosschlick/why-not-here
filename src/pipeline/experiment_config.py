import copy
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

from src import config
from src.incremental import ClosedLoopResult
from src.pipeline.generate_map import generate_map
from src.pipeline.run_isp import run_isp

CONFIG_REGISTRY = {
    "MAP_W": "config_grid.py",
    "MAP_H": "config_grid.py",
    "CELL_SIZE": "config_grid.py",
    "DEFAULT_TERRAIN": "config_grid.py",
    "CONNECTIVITY": "config_grid.py",
    "MAP_DEFAULT_SEED": "config_map.py",
    "MAP_ELEVATION_SCALE": "config_map.py",
    "MAP_ELEVATION_FREQ": "config_map.py",
    "MAP_ELEVATION_OCTAVES": "config_map.py",
    "MAP_MOISTURE_FREQ": "config_map.py",
    "MAP_MOISTURE_OCTAVES": "config_map.py",
    "MAP_ROUGHNESS_FREQ": "config_map.py",
    "MAP_ROUGHNESS_OCTAVES": "config_map.py",
    "MAP_TERRAIN_THRESHOLDS": "config_map.py",
    "MAP_ROUGHNESS_THRESHOLDS": "config_map.py",
    "MAP_MIN_MAIN_COMPONENT_RATIO": "config_map.py",
    "MAP_MAX_GENERATION_ATTEMPTS": "config_map.py",
    "DEFAULT_PLANNER": "config_planning.py",
    "TARGET_TERRAIN": "config_isp.py",
    "BASE_TERRAIN": "config_terrain.py",
    "TERRAINS": "config_terrain.py",
    "TERRAIN_COLORS": "config_terrain.py",
    "MAX_SLOPE_DEG": "config_terrain.py",
    "DEFAULT_SOLVER": "config_solver.py",
    "SOLVER_TIMEOUT_SEC": "config_solver.py",
    "DEFAULT_REDUCTION_METHOD": "config_reduction.py",
    "BBOX_MARGIN": "config_reduction.py",
    "USE_INCREMENTAL_SOLVER": "config_incremental.py",
    "MAX_ISP_ITERATIONS": "config_incremental.py",
    "CLOSED_LOOP_TIMEOUT_SEC": "config_incremental.py",
    "INCREMENTAL_ASTAR_SCOPE": "config_incremental.py",
    "OUTPUT_DIR": "config_storage.py",
}


def get_all_configurations() -> dict[str, Any]:
    return {
        key: copy.deepcopy(getattr(config, key))
        for key in CONFIG_REGISTRY
        if hasattr(config, key)
    }


DEFAULT_CONFIGURATIONS = get_all_configurations()


def cast_parameter_value(current_value: Any, new_value: Any) -> Any:
    if isinstance(current_value, bool) and not isinstance(new_value, bool):
        normalized = str(new_value).lower()
        if normalized not in ("true", "1", "yes", "false", "0", "no"):
            raise ValueError(f"Invalid boolean configuration value: {new_value!r}")
        return normalized in ("true", "1", "yes")
    if isinstance(current_value, int) and not isinstance(new_value, int):
        return int(new_value)
    if isinstance(current_value, float) and not isinstance(new_value, float):
        converted = float(new_value)
        if not math.isfinite(converted):
            raise ValueError("Numeric configuration values must be finite.")
        return converted
    return copy.deepcopy(new_value)


def _validate_configuration(candidate: dict[str, Any]) -> dict[str, Any]:
    solver = str(candidate["DEFAULT_SOLVER"]).strip().upper()
    if solver not in {"HIGHS", "GUROBI"}:
        raise ValueError("DEFAULT_SOLVER must be either 'HIGHS' or 'GUROBI'.")
    candidate["DEFAULT_SOLVER"] = solver

    positive_float_keys = (
        "CELL_SIZE",
        "CLOSED_LOOP_TIMEOUT_SEC",
        "MAP_ELEVATION_SCALE",
        "MAP_ELEVATION_FREQ",
        "MAP_MOISTURE_FREQ",
        "MAP_ROUGHNESS_FREQ",
    )
    for key in positive_float_keys:
        value = float(candidate[key])
        if not math.isfinite(value) or value <= 0.0:
            raise ValueError(f"{key} must be a finite number greater than zero.")
        candidate[key] = value

    for key in (
        "MAP_ELEVATION_OCTAVES",
        "MAP_MOISTURE_OCTAVES",
        "MAP_ROUGHNESS_OCTAVES",
        "MAP_MAX_GENERATION_ATTEMPTS",
        "MAP_H",
        "MAP_W",
    ):
        value = int(candidate[key])
        if value < 1:
            raise ValueError(f"{key} must be greater than zero.")
        candidate[key] = value

    component_ratio = float(candidate["MAP_MIN_MAIN_COMPONENT_RATIO"])
    if not math.isfinite(component_ratio) or not 0.0 < component_ratio <= 1.0:
        raise ValueError("MAP_MIN_MAIN_COMPONENT_RATIO must be greater than 0 and at most 1.")
    candidate["MAP_MIN_MAIN_COMPONENT_RATIO"] = component_ratio

    connectivity = int(candidate["CONNECTIVITY"])
    if connectivity not in (4, 8):
        raise ValueError("CONNECTIVITY must be either 4 or 8.")
    candidate["CONNECTIVITY"] = connectivity

    max_slope = float(candidate["MAX_SLOPE_DEG"])
    if not math.isfinite(max_slope) or not 0.0 <= max_slope <= 90.0:
        raise ValueError("MAX_SLOPE_DEG must be between 0 and 90 degrees.")
    candidate["MAX_SLOPE_DEG"] = max_slope

    raw_terrains = candidate.get("TERRAINS")
    if not isinstance(raw_terrains, dict) or not raw_terrains:
        raise ValueError("TERRAINS must contain at least one terrain.")

    terrains: dict[str, float] = {}
    normalized_names: set[str] = set()
    for raw_name, raw_speed in raw_terrains.items():
        if not isinstance(raw_name, str) or not raw_name.strip():
            raise ValueError("Terrain names must be non-empty strings.")
        name = raw_name.strip()
        normalized_name = name.casefold()
        if normalized_name in normalized_names:
            raise ValueError(f"Terrain names must be unique: {name!r}.")
        normalized_names.add(normalized_name)
        try:
            speed = float(raw_speed)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Terrain speed for {name!r} must be numeric.") from exc
        if not math.isfinite(speed):
            raise ValueError(f"Terrain speed for {name!r} must be finite.")
        terrains[name] = speed

    if terrains.get("WATER_RIVER", 0.0) > 0.0:
        raise ValueError("WATER_RIVER must have a speed at or below zero.")

    traversable = {name for name, speed in terrains.items() if speed > 0.0}
    if not traversable:
        raise ValueError("At least one terrain must have a speed greater than zero.")

    raw_colors = candidate.get("TERRAIN_COLORS")
    if not isinstance(raw_colors, dict):
        raw_colors = {}
    colors: dict[str, str] = {}
    for name in terrains:
        color = raw_colors.get(name, "#808080")
        if not isinstance(color, str) or re.fullmatch(r"#[0-9A-Fa-f]{6}", color) is None:
            raise ValueError(f"Terrain color for {name!r} must use #RRGGBB format.")
        colors[name] = color.upper()

    default_terrain = candidate.get("DEFAULT_TERRAIN")
    target_terrain = candidate.get("TARGET_TERRAIN")
    base_terrain = candidate.get("BASE_TERRAIN")
    if default_terrain not in terrains:
        raise ValueError("DEFAULT_TERRAIN must exist in TERRAINS.")
    if target_terrain not in traversable:
        raise ValueError("TARGET_TERRAIN must exist and have a speed greater than zero.")
    if base_terrain not in traversable:
        raise ValueError("BASE_TERRAIN must exist and have a speed greater than zero.")

    threshold_specs = {
        "MAP_TERRAIN_THRESHOLDS": {
            "LOWLAND_ELEVATION_MAX",
            "WATER_MOISTURE_MIN",
            "MUD_MOISTURE_MIN",
            "ROCKY_ELEVATION_MIN",
            "ROCKY_MOISTURE_MAX",
            "FOREST_MOISTURE_MIN",
            "DRY_MOISTURE_MAX",
            "GRASSLAND_ELEVATION_MIN",
        },
        "MAP_ROUGHNESS_THRESHOLDS": {
            "FOREST",
            "ROCKY",
            "GRASSLAND",
            "GRASS",
            "DRY_VEGETATION",
            "MUD",
            "SAND",
        },
    }
    for key, expected_names in threshold_specs.items():
        raw_thresholds = candidate[key]
        if not isinstance(raw_thresholds, dict) or set(raw_thresholds) != expected_names:
            raise ValueError(f"{key} must define exactly: {', '.join(sorted(expected_names))}.")
        thresholds: dict[str, float] = {}
        for name, raw_value in raw_thresholds.items():
            value = float(raw_value)
            if not math.isfinite(value) or not 0.0 <= value <= 1.0:
                raise ValueError(f"{key}.{name} must be between 0 and 1.")
            thresholds[name] = value
        candidate[key] = thresholds

    candidate["TERRAINS"] = terrains
    candidate["TERRAIN_COLORS"] = colors
    return candidate


def _build_configuration_candidate(
    updates: dict[str, Any],
    base: dict[str, Any] | None = None,
) -> dict[str, Any]:
    candidate = copy.deepcopy(base if base is not None else get_all_configurations())
    for key, raw_value in updates.items():
        if key not in CONFIG_REGISTRY:
            continue
        candidate[key] = cast_parameter_value(candidate[key], raw_value)
    return _validate_configuration(candidate)


def _publish_configuration_value(key: str, value: Any) -> None:
    value = copy.deepcopy(value)
    setattr(config, key, value)

    submodule_name = CONFIG_REGISTRY.get(key, "")[:-3]
    if submodule_name and hasattr(config, submodule_name):
        setattr(getattr(config, submodule_name), key, copy.deepcopy(value))

    for module_name, module in list(sys.modules.items()):
        if (module_name == "src.config" or module_name.startswith("src.")) and hasattr(module, key):
            setattr(module, key, copy.deepcopy(value))


def _publish_derived_configuration() -> None:
    terrains = config.TERRAINS
    derived_values = {
        "IMPASSABLE_TERRAINS": {
            name for name, speed in terrains.items() if speed <= 0.0
        }
        | {"WATER_RIVER"},
        "V_MAX": max(terrains.values()),
        "TARGET_SPEED": terrains[config.TARGET_TERRAIN],
    }
    for key, value in derived_values.items():
        setattr(config, key, copy.deepcopy(value))
        for module_name, module in list(sys.modules.items()):
            if (module_name == "src.config" or module_name.startswith("src.")) and hasattr(module, key):
                setattr(module, key, copy.deepcopy(value))


def update_configurations(updates: dict[str, Any]) -> dict[str, Any]:
    candidate = _build_configuration_candidate(updates)
    applied = {key: candidate[key] for key in updates if key in CONFIG_REGISTRY}
    for key, value in candidate.items():
        _publish_configuration_value(key, value)
    _publish_derived_configuration()
    return copy.deepcopy(applied)


def build_experiment_config(
    config_dict: dict[str, Any] | None = None,
    start: tuple[int, int] | list[int] | None = None,
    goal: tuple[int, int] | list[int] | None = None,
    user_path: list[tuple[int, int]] | list[list[int]] | None = None,
) -> dict[str, Any]:
    current_system = _build_configuration_candidate(
        config_dict or {}, base=get_all_configurations()
    )

    raw_start = start if start is not None else getattr(config, "START_COORD", None)
    raw_goal = goal if goal is not None else getattr(config, "GOAL_COORD", None)

    export_dict: dict[str, Any] = {
        key: copy.deepcopy(current_system[key])
        for key in CONFIG_REGISTRY
        if key in current_system
    }

    if raw_start is not None:
        export_dict["start"] = [int(raw_start[0]), int(raw_start[1])]
    if raw_goal is not None:
        export_dict["goal"] = [int(raw_goal[0]), int(raw_goal[1])]
    if user_path is not None:
        export_dict["p_user"] = [[int(pt[0]), int(pt[1])] for pt in user_path]

    return export_dict


def save_experiment_configurations(
    destination_dir: str | Path,
    configurations: list[dict[str, Any]],
) -> list[str]:
    destination = Path(destination_dir).expanduser().resolve()
    if not destination.exists() or not destination.is_dir():
        raise ValueError("Configuration destination must be an existing directory.")
    if not configurations:
        raise ValueError("At least one configuration is required.")

    prepared: list[tuple[Path, str]] = []
    names: set[str] = set()
    existing_names = {entry.name.casefold() for entry in destination.iterdir()}

    for item in configurations:
        raw_name = str(item.get("name", "")).strip()
        if raw_name.lower().endswith(".json"):
            raw_name = raw_name[:-5]
        if (
            not raw_name
            or raw_name in {".", ".."}
            or len(raw_name) > 180
            or any(ord(character) < 32 for character in raw_name)
            or any(character in raw_name for character in '/\\<>:"|?*')
        ):
            raise ValueError("Configuration names must be valid file names.")

        filename = f"{raw_name}.json"
        normalized_name = filename.casefold()
        if normalized_name in names:
            raise ValueError(f"Duplicate configuration name: {raw_name}")
        if normalized_name in existing_names:
            raise FileExistsError(f"Configuration file already exists: {filename}")
        names.add(normalized_name)

        config_dict = item.get("config") or {}
        start = item.get("start")
        goal = item.get("goal")
        user_path = item.get("user_path")
        export_data = build_experiment_config(
            config_dict=config_dict,
            start=start,
            goal=goal,
            user_path=user_path,
        )
        validate_experiment_config(export_data)
        prepared.append((destination / filename, json.dumps(export_data, indent=2)))

    created_paths: list[Path] = []
    try:
        for target, content in prepared:
            config_file = target.open("x", encoding="utf-8")
            created_paths.append(target)
            with config_file:
                config_file.write(content)
                config_file.write("\n")
    except OSError:
        for target in created_paths:
            target.unlink(missing_ok=True)
        raise

    return [str(target) for target, _ in prepared]


def validate_experiment_config(
    data: dict[str, Any],
) -> tuple[dict[str, Any], tuple[int, int], tuple[int, int], list[tuple[int, int]]]:
    if not isinstance(data, dict):
        raise TypeError("Configuration payload must be a JSON object dictionary.")

    flattened = dict(data)
    if "config" in data and isinstance(data["config"], dict):
        for k, v in data["config"].items():
            if k not in flattened:
                flattened[k] = v

    raw_start = flattened.get("start") or flattened.get("START_COORD")
    if not raw_start or not isinstance(raw_start, (list, tuple)) or len(raw_start) != 2:
        raise ValueError("Configuration must contain a valid 2D 'start' coordinate [row, col].")
    start = (int(raw_start[0]), int(raw_start[1]))

    raw_goal = flattened.get("goal") or flattened.get("GOAL_COORD")
    if not raw_goal or not isinstance(raw_goal, (list, tuple)) or len(raw_goal) != 2:
        raise ValueError("Configuration must contain a valid 2D 'goal' coordinate [row, col].")
    goal = (int(raw_goal[0]), int(raw_goal[1]))

    raw_route = flattened.get("p_user") or flattened.get("user_path")
    if not raw_route or not isinstance(raw_route, list):
        raise ValueError("Configuration must contain a valid non-empty 'p_user' coordinate route.")

    p_user: list[tuple[int, int]] = []
    for item in raw_route:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            raise ValueError(f"Invalid coordinate in route: {item}. Expected [row, col].")
        p_user.append((int(item[0]), int(item[1])))

    if not p_user:
        raise ValueError("Route 'p_user' cannot be empty.")

    if p_user[0] != start:
        raise ValueError(
            f"Alternative route 'p_user' origin {p_user[0]} does not match defined start coordinate {start}."
        )
    if p_user[-1] != goal:
        raise ValueError(
            f"Alternative route 'p_user' endpoint {p_user[-1]} does not match defined goal coordinate {goal}."
        )

    supplied_config = {
        key: value for key, value in flattened.items() if key in CONFIG_REGISTRY
    }
    params = _build_configuration_candidate(
        supplied_config,
        base=copy.deepcopy(DEFAULT_CONFIGURATIONS),
    )

    map_h = params["MAP_H"]
    map_w = params["MAP_W"]

    for node in (start, goal):
        if not (0 <= node[0] < map_h and 0 <= node[1] < map_w):
            raise ValueError(f"Coordinate {node} falls outside map boundaries ({map_h}x{map_w}).")

    for node in p_user:
        if not (0 <= node[0] < map_h and 0 <= node[1] < map_w):
            raise ValueError(f"Route node {node} falls outside map boundaries ({map_h}x{map_w}).")

    return params, start, goal, p_user


def apply_experiment_config(
    params: dict[str, Any],
    start: tuple[int, int] | None = None,
    goal: tuple[int, int] | None = None,
) -> dict[str, Any]:
    applied = update_configurations(params)

    config.START_COORD = start
    config.GOAL_COORD = goal
    if hasattr(config, "config_planning"):
        config.config_planning.START_COORD = start
        config.config_planning.GOAL_COORD = goal

    for mod_name, mod in list(sys.modules.items()):
        if (mod_name == "src.config" or mod_name.startswith("src.")) and hasattr(mod, "START_COORD"):
            mod.START_COORD = start
        if (mod_name == "src.config" or mod_name.startswith("src.")) and hasattr(mod, "GOAL_COORD"):
            mod.GOAL_COORD = goal

    return applied


def load_experiment_file(file_path: str | Path) -> dict[str, Any]:
    target = Path(file_path).resolve()
    if not target.exists():
        raise FileNotFoundError(f"Configuration file not found: {target}")
    if not target.is_file():
        raise ValueError(f"Configuration path is not a file: {target}")
    with open(target, "r", encoding="utf-8") as f:
        return json.load(f)


def execute_experiment(
    config_data: dict[str, Any],
    verbose: bool = True,
) -> ClosedLoopResult | None:
    params, start, goal, p_user = validate_experiment_config(config_data)

    if verbose:
        print(f"Applying configuration for seed={params.get('MAP_DEFAULT_SEED')}...")

    apply_experiment_config(params, start=start, goal=goal)

    generate_map(verbose=verbose)
    result = run_isp(verbose=verbose, user_path=p_user, start=start, goal=goal)

    return result
