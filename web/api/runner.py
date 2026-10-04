import math
import threading
from typing import Any

from src.pipeline.experiment_config import apply_experiment_config
from src.pipeline.generate_map import generate_map
from src.pipeline.run_isp import run_isp

from .artifacts import collect_artifacts


def _finite_round(value: float, digits: int) -> float | None:
    return round(value, digits) if math.isfinite(value) else None


class PipelineRunner:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.state: dict[str, Any] = {
            "running": False,
            "current_run": 0,
            "total_runs": 0,
            "status": "idle",
            "error": None,
            "last_result": None,
            "artifacts": [],
            "generation_runs": [],
        }

    def is_running(self) -> bool:
        with self.lock:
            return self.state["running"]

    def start(self, runs: int) -> None:
        with self.lock:
            self.state["running"] = True
            self.state["current_run"] = 0
            self.state["total_runs"] = runs
            self.state["status"] = "started"
            self.state["error"] = None
            self.state["last_result"] = None
            self.state["artifacts"] = []
            self.state["generation_runs"] = []

        worker_thread = threading.Thread(
            target=self._run_loop, args=(runs,), daemon=True
        )
        worker_thread.start()

    def _run_loop(self, runs: int) -> None:
        try:
            apply_experiment_config({}, start=None, goal=None)
            for index in range(1, runs + 1):
                with self.lock:
                    self.state["current_run"] = index
                    self.state["status"] = f"Running {index} of {runs}"
                grid = generate_map(verbose=False)
                generation = {
                    "base_seed": grid.base_seed,
                    "effective_seed": grid.effective_seed,
                    "generation_attempt": grid.generation_attempt,
                }
                with self.lock:
                    self.state["generation_runs"].append(generation)
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
                            "water": len(result.modifications.water_nodes),
                            "terrain_nodes": result.modifications.terrain_nodes,
                            "obstacle_nodes": result.modifications.obstacle_nodes,
                            "slope_edges": result.modifications.slope_edges,
                            "water_nodes": result.modifications.water_nodes,
                        }
                    with self.lock:
                        self.state["last_result"] = {
                            "success": result.success,
                            "solver_status": result.solver_status,
                            "runtime_sec": round(result.runtime_sec, 3),
                            "iterations": result.iterations,
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
                self.state["artifacts"] = collect_artifacts()
        except (RuntimeError, ValueError, KeyError, OSError) as exc:
            with self.lock:
                self.state["status"] = "failed"
                self.state["error"] = str(exc)
        finally:
            with self.lock:
                self.state["running"] = False

    def get_status(self) -> dict[str, Any]:
        with self.lock:
            snapshot = dict(self.state)
            snapshot["generation_runs"] = list(self.state["generation_runs"])
            return snapshot


runner = PipelineRunner()
