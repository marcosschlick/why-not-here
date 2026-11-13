import math
import threading
from pathlib import Path
from typing import Any

from src.pipeline.experiment_config import (
    apply_experiment_config,
    get_experiment_configurations,
)
from src.pipeline.generate_map import generate_map
from src.pipeline.run_isp import run_isp
from src.pipeline.storage import reserve_output_directory

from .artifacts import collect_artifacts


def _finite_round(value: float, digits: int) -> float | None:
    return round(value, digits) if math.isfinite(value) else None


class PipelineRunner:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.execution_lock = threading.Lock()
        self.state: dict[str, Any] = {
            "running": False,
            "current_run": 0,
            "total_runs": 0,
            "status": "idle",
            "error": None,
            "last_result": None,
            "artifacts": [],
            "generation_runs": [],
            "output_dirs": [],
        }

    def is_running(self) -> bool:
        with self.lock:
            return self.state["running"]

    def start(self, runs: int, output: dict[str, Any]) -> None:
        if not self.execution_lock.acquire(blocking=False):
            raise RuntimeError("Pipeline execution already in progress.")
        parameters = get_experiment_configurations()
        output_dirs: list[Path] = []
        try:
            for index in range(1, runs + 1):
                target = dict(output)
                if runs > 1 and target.get("name"):
                    target["name"] = f"{target['name']}-map-{index}"
                output_dirs.append(
                    reserve_output_directory(
                        parameters["MAP_H"], parameters["MAP_W"], **target
                    )
                )
        except (ValueError, OSError):
            for directory in output_dirs:
                directory.rmdir()
            self.execution_lock.release()
            raise
        with self.lock:
            self.state["running"] = True
            self.state["current_run"] = 0
            self.state["total_runs"] = runs
            self.state["status"] = "started"
            self.state["error"] = None
            self.state["last_result"] = None
            self.state["artifacts"] = []
            self.state["generation_runs"] = []
            self.state["output_dirs"] = []

        worker_thread = threading.Thread(
            target=self._run_loop,
            args=(output_dirs, parameters),
            daemon=True,
        )
        worker_thread.start()

    def _run_loop(self, output_dirs: list[Path], parameters: dict[str, Any]) -> None:
        try:
            apply_experiment_config({}, start=None, goal=None)
            for index, output_dir in enumerate(output_dirs, start=1):
                with self.lock:
                    self.state["current_run"] = index
                    self.state["status"] = f"Running {index} of {len(output_dirs)}"
                apply_experiment_config(
                    {**parameters, "OUTPUT_DIR": str(output_dir)}, start=None, goal=None
                )
                grid = generate_map(verbose=False)
                generation = {
                    "base_seed": grid.base_seed,
                    "effective_seed": grid.effective_seed,
                    "generation_attempt": grid.generation_attempt,
                }
                with self.lock:
                    self.state["generation_runs"].append(generation)
                    self.state["output_dirs"].append(str(output_dir))
                result = run_isp(verbose=False)
                if result is None:
                    raise RuntimeError("Pipeline did not produce an ISP result.")
                if result:
                    mod_counts = None
                    if result.modifications:
                        mod_counts = {
                            "terrain": len(result.modifications.terrain_nodes),
                            "obstacle": len(result.modifications.obstacle_nodes),
                            "slope": len(result.modifications.slope_edges),
                            "opened_terrain": len(
                                result.modifications.opened_terrain_nodes
                            ),
                            "opened_terrain_nodes": result.modifications.opened_terrain_nodes,
                            "robot_speed": len(result.modifications.robot_speed_edges),
                            "terrain_nodes": result.modifications.terrain_nodes,
                            "obstacle_nodes": result.modifications.obstacle_nodes,
                            "slope_edges": result.modifications.slope_edges,
                            "terrain_assignments": result.modifications.terrain_assignments,
                            "robot_speed_edges": result.modifications.robot_speed_edges,
                        }
                    with self.lock:
                        self.state["last_result"] = {
                            "success": result.success,
                            "solver_status": result.solver_status,
                            "runtime_sec": round(result.runtime_sec, 3),
                            "iterations": result.iterations,
                            "graph_nodes": result.graph_nodes,
                            "graph_edges": result.graph_edges,
                            "path_metrics": result.path_metrics,
                            "iteration_metrics": result.iteration_metrics,
                            "original_optimal_cost": _finite_round(
                                result.original_optimal_cost, 4
                            ),
                            "final_alternative_cost": _finite_round(
                                result.final_alternative_cost, 4
                            ),
                            "explanation_text": result.explanation_text,
                            "cost_baseline_text": result.cost_baseline_text,
                            "modifications": mod_counts,
                        }
            with self.lock:
                self.state["status"] = "completed"
                self.state["artifacts"] = [
                    artifact
                    for directory in self.state["output_dirs"]
                    for artifact in collect_artifacts(directory)
                ]
        except (RuntimeError, ValueError, KeyError, OSError) as exc:
            with self.lock:
                self.state["status"] = "failed"
                self.state["error"] = str(exc)
        finally:
            with self.lock:
                self.state["running"] = False
            self.execution_lock.release()

    def get_status(self) -> dict[str, Any]:
        with self.lock:
            snapshot = dict(self.state)
            snapshot["generation_runs"] = list(self.state["generation_runs"])
            snapshot["output_dirs"] = list(self.state["output_dirs"])
            return snapshot


runner = PipelineRunner()
