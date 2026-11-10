import json
import math
import sys
from dataclasses import asdict
from pathlib import Path

from src.incremental import ISPValidator
from src.pipeline.experiment_config import (
    apply_experiment_config,
    get_all_configurations,
)
from src.pipeline.generate_map import generate_map
from src.pipeline.run_isp import run_isp
from src.pipeline.utils import create_alternative_path, prepare_endpoints


def json_safe(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [json_safe(item) for item in value]
    return value


def generate_scenario(request: dict, directory: Path) -> dict:
    configuration = request["configuration"]
    configuration.update(request["overrides"])
    configuration["OUTPUT_DIR"] = str(directory)
    start = tuple(request["start"]) if request["start"] is not None else None
    goal = tuple(request["goal"]) if request["goal"] is not None else None
    apply_experiment_config(configuration, start=start, goal=goal)
    grid = generate_map(verbose=False, persist_artifacts=False)
    start, goal = prepare_endpoints(grid, start=start, goal=goal)
    alternative = request["alternative_path"]
    path = (
        [tuple(point) for point in alternative]
        if alternative is not None
        else create_alternative_path(grid, start, goal)
    )
    map_path = directory / "map" / "map.json"
    grid.save(map_path)
    result = run_isp(verbose=False, user_path=path, start=start, goal=goal)
    if result is None:
        return {"error": "No optimal path could be found", "status": "NO_PATH"}
    if not result.success:
        return {"error": result.explanation_text, "status": result.solver_status}
    effective_configuration = get_all_configurations()
    effective_configuration.pop("OUTPUT_DIR", None)
    modified_grid = (
        ISPValidator.apply_modifications(grid, result.modifications).to_dict()
        if result.modifications is not None
        else None
    )
    return json_safe(
        {
            "configuration": effective_configuration,
            "data": {
                "map": grid.to_dict(),
                "modified_map": modified_grid,
                "start": start,
                "goal": goal,
                "optimal_path": result.original_optimal_path,
                "alternative_path": path,
                "original_optimal_cost": result.original_optimal_cost,
                "original_alternative_cost": ISPValidator.compute_path_cost(grid, path),
                "final_alternative_cost": result.final_alternative_cost,
                "explanation_text": result.explanation_text,
                "cost_baseline_text": result.cost_baseline_text,
                "modifications": asdict(result.modifications)
                if result.modifications is not None
                else None,
                "solver_status": result.solver_status,
                "path_metrics": result.path_metrics,
            },
        }
    )


def main() -> None:
    request_path = Path(sys.argv[1])
    result_path = Path(sys.argv[2])
    try:
        request = json.loads(request_path.read_text(encoding="utf-8"))
        result = generate_scenario(request, request_path.parent)
    except (ValueError, TypeError, KeyError) as error:
        result = {"error": str(error), "status": "INVALID_INPUT"}
    result_path.write_text(json.dumps(result, allow_nan=False), encoding="utf-8")


if __name__ == "__main__":
    main()
