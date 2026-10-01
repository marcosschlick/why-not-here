import json
from pathlib import Path
import sys
from typing import Any

from src import config
from src.incremental import ClosedLoopResult
from src.pipeline.generate_map import generate_map
from src.pipeline.run_isp import run_isp

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
    "DEFAULT_SOLVER": "config_solver.py",
    "SOLVER_TIMEOUT_SEC": "config_solver.py",
    "DEFAULT_REDUCTION_METHOD": "config_reduction.py",
    "BBOX_MARGIN": "config_reduction.py",
    "USE_INCREMENTAL_SOLVER": "config_incremental.py",
    "MAX_ISP_ITERATIONS": "config_incremental.py",
    "INCREMENTAL_ASTAR_SCOPE": "config_incremental.py",
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


def build_experiment_config(
    config_dict: dict[str, Any] | None = None,
    start: tuple[int, int] | list[int] | None = None,
    goal: tuple[int, int] | list[int] | None = None,
    user_path: list[tuple[int, int]] | list[list[int]] | None = None,
) -> dict[str, Any]:
    current_system = get_all_configurations()
    if config_dict:
        for k, v in config_dict.items():
            if k in CONFIG_REGISTRY:
                current_system[k] = cast_parameter_value(current_system.get(k), v)

    raw_start = start if start is not None else getattr(config, "START_COORD", None)
    raw_goal = goal if goal is not None else getattr(config, "GOAL_COORD", None)

    export_dict: dict[str, Any] = {
        "MAP_H": int(current_system.get("MAP_H", 64)),
        "MAP_W": int(current_system.get("MAP_W", 128)),
        "CELL_SIZE": float(current_system.get("CELL_SIZE", 1.0)),
        "CONNECTIVITY": int(current_system.get("CONNECTIVITY", 8)),
        "MAP_DEFAULT_SEED": int(current_system.get("MAP_DEFAULT_SEED", 42)),
        "MAP_ELEVATION_SCALE": float(current_system.get("MAP_ELEVATION_SCALE", 2.0)),
        "MAP_ELEVATION_FREQ": float(current_system.get("MAP_ELEVATION_FREQ", 0.06)),
        "MAP_OBSTACLE_FREQ": float(current_system.get("MAP_OBSTACLE_FREQ", 0.05)),
        "MAP_OBSTACLE_THRESHOLD": float(current_system.get("MAP_OBSTACLE_THRESHOLD", 0.85)),
        "DEFAULT_SOLVER": str(current_system.get("DEFAULT_SOLVER", "HIGHS")),
        "SOLVER_TIMEOUT_SEC": float(current_system.get("SOLVER_TIMEOUT_SEC", 6000.0)),
        "USE_INCREMENTAL_SOLVER": bool(current_system.get("USE_INCREMENTAL_SOLVER", False)),
        "MAX_ISP_ITERATIONS": int(current_system.get("MAX_ISP_ITERATIONS", 50)),
        "INCREMENTAL_ASTAR_SCOPE": str(current_system.get("INCREMENTAL_ASTAR_SCOPE", "GLOBAL")),
        "DEFAULT_REDUCTION_METHOD": str(current_system.get("DEFAULT_REDUCTION_METHOD", "SPARSIFIED")),
        "BBOX_MARGIN": int(current_system.get("BBOX_MARGIN", 2)),
        "TARGET_TERRAIN": str(current_system.get("TARGET_TERRAIN", "COMPACTED_SOIL")),
        "DEFAULT_PLANNER": str(current_system.get("DEFAULT_PLANNER", "ASTAR")),
        "OUTPUT_DIR": str(current_system.get("OUTPUT_DIR", "output")),
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
        raise ValueError("Configuration payload must be a JSON object dictionary.")

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

    params: dict[str, Any] = {}
    current_defaults = get_all_configurations()
    for key in CONFIG_REGISTRY:
        if key in flattened:
            params[key] = cast_parameter_value(current_defaults.get(key), flattened[key])

    map_h = params.get("MAP_H", current_defaults.get("MAP_H", 64))
    map_w = params.get("MAP_W", current_defaults.get("MAP_W", 128))

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
