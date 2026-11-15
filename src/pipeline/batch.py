import json
import logging
from pathlib import Path
from typing import Any

from src.pipeline.experiment_config import execute_experiment, load_experiment_file
from src.pipeline.storage import reserve_batch_directory
from src.pipeline.utils import get_project_path

logger = logging.getLogger(__name__)


def execute_batch(source: str | Path, verbose: bool = True) -> bool:
    directory = Path(source).expanduser().resolve()
    if not directory.is_dir():
        raise ValueError(f"Batch path is not a directory: {directory}")
    files = sorted(
        directory.glob("*.json"), key=lambda path: (path.name.casefold(), path.name)
    )
    if not files:
        raise ValueError(f"Batch directory contains no JSON files: {directory}")

    output = reserve_batch_directory(get_project_path("results"))
    summary: dict[str, Any] = {"source": str(directory), "groups": []}
    summary_path = output / "batch.json"

    def save_summary() -> None:
        summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    groups: dict[tuple[str, str], dict[str, Any]] = {}
    configurations: dict[str, dict[str, Any]] = {}
    for path in files:
        item: dict[str, Any] = {
            "source": str(path),
            "status": "pending",
            "error": None,
            "scenarios": [],
        }
        try:
            data = load_experiment_file(path)
            if not isinstance(data, dict):
                raise TypeError(
                    "Configuration payload must be a JSON object dictionary."
                )
            execution = data.get("execution", {})
            group_id = (
                execution.get("benchmark_group_id")
                if isinstance(execution, dict)
                else None
            )
            key = (
                ("group", group_id)
                if isinstance(group_id, str) and group_id
                else ("file", str(path))
            )
            configurations[str(path)] = data
        except (OSError, ValueError, TypeError) as exc:
            key = ("file", str(path))
            group_id = None
            item["status"] = "failed"
            item["error"] = f"{type(exc).__name__}: {exc}"
        if key not in groups:
            group = {
                "benchmark_group_id": group_id,
                "output": None,
                "configurations": [],
            }
            groups[key] = group
            summary["groups"].append(group)
        groups[key]["configurations"].append(item)

    save_summary()
    if verbose:
        print(f"Batch results: {output}")

    order = 0
    for group_index, group in enumerate(summary["groups"], start=1):
        group_output = output / f"map-{group_index:03d}"
        group_output.mkdir()
        group["output"] = str(group_output)
        for item in group["configurations"]:
            if item["status"] == "failed":
                continue
            if verbose:
                print(f"Configuration: {item['source']}")

            def record_scenario(
                record: dict[str, Any], current: dict[str, Any] = item
            ) -> int:
                nonlocal order
                if record["status"] == "running":
                    order += 1
                    record["execution_order"] = order
                    current["scenarios"].append(record)
                save_summary()
                return record["execution_order"]

            try:
                item["status"] = "running"
                save_summary()
                execute_experiment(
                    configurations[item["source"]],
                    verbose=verbose,
                    batch_directory=group_output,
                    record_scenario=record_scenario,
                )
                item["status"] = (
                    "failed"
                    if any(s["status"] == "failed" for s in item["scenarios"])
                    else "completed"
                )
            except Exception as exc:
                logger.exception("Configuration execution failed: %s", item["source"])
                item["status"] = "failed"
                item["error"] = f"{type(exc).__name__}: {exc}"
                if verbose:
                    print(f"Configuration failed: {item['error']}")
            save_summary()
    return all(
        item["status"] == "completed"
        for group in summary["groups"]
        for item in group["configurations"]
    )
