import threading
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

from src.pipeline.experiment_config import (
    apply_experiment_config,
    expand_scenario_configurations,
    get_experiment_configurations,
)
from src.pipeline.generate_map import generate_map, persist_map
from src.pipeline.reporting import serialize_result
from src.pipeline.run_isp import run_isp
from src.pipeline.storage import reserve_output_directory, set_output_directory
from src.pipeline.utils import create_alternative_path, prepare_endpoints

from .artifacts import collect_artifacts


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
            "results": [],
            "artifacts": [],
            "generation_runs": [],
            "output_dirs": [],
        }

    def is_running(self) -> bool:
        with self.lock:
            return self.state["running"]

    def start(self, runs: int) -> None:
        if not self.execution_lock.acquire(blocking=False):
            raise RuntimeError("Pipeline execution already in progress.")
        parameters = {**get_experiment_configurations(), "ISP_MODEL": "NORMAL"}
        output_dirs: list[Path] = []
        try:
            scenarios = expand_scenario_configurations(parameters)
            for index in range(1, runs + 1):
                for scenario in scenarios:
                    output_dirs.append(
                        reserve_output_directory(
                            parameters["MAP_H"],
                            parameters["MAP_W"],
                            map_index=index if runs > 1 else None,
                            benchmark=len(scenarios) > 1,
                            incremental=scenario["USE_INCREMENTAL_SOLVER"],
                            reduction=scenario["DEFAULT_REDUCTION_METHOD"],
                            isp_model=scenario["ISP_MODEL"],
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
            self.state["total_runs"] = len(output_dirs)
            self.state["status"] = "started"
            self.state["error"] = None
            self.state["last_result"] = None
            self.state["results"] = []
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
            scenarios = expand_scenario_configurations(parameters)
            order = 0
            for _ in range(len(output_dirs) // len(scenarios)):
                apply_experiment_config(parameters, start=None, goal=None)
                generation_started = time.perf_counter_ns()
                grid = generate_map(verbose=False, persist_artifacts=False)
                generation_sec = (time.perf_counter_ns() - generation_started) / 1e9
                group_id = str(uuid4())
                start, goal = prepare_endpoints(grid)
                path = create_alternative_path(grid, start, goal)
                with self.lock:
                    self.state["generation_runs"].append(
                        {
                            "base_seed": grid.base_seed,
                            "effective_seed": grid.effective_seed,
                            "generation_attempt": grid.generation_attempt,
                        }
                    )
                for scenario in scenarios:
                    output_dir = output_dirs[order]
                    order += 1
                    with self.lock:
                        self.state["current_run"] = order
                        self.state["status"] = f"Running {order} of {len(output_dirs)}"
                    apply_experiment_config(scenario, start=start, goal=goal)
                    set_output_directory(output_dir)
                    persist_map(grid, start=start, goal=goal)
                    with self.lock:
                        self.state["output_dirs"].append(str(output_dir))
                    result = run_isp(
                        verbose=False,
                        grid=grid,
                        start=start,
                        goal=goal,
                        user_path=path,
                        metadata={
                            "execution_order": order,
                            "repetition_index": 1,
                            "benchmark_group_id": group_id,
                            "map_generation_sec": generation_sec,
                        },
                    )
                    record = serialize_result(result)
                    with self.lock:
                        self.state["last_result"] = record
                        self.state["results"].append(record)
                        if record["execution_error"]:
                            self.state["error"] = record["execution_error"]
            with self.lock:
                self.state["status"] = "failed" if self.state["error"] else "completed"
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
            snapshot["results"] = list(self.state["results"])
            snapshot["generation_runs"] = list(self.state["generation_runs"])
            snapshot["output_dirs"] = list(self.state["output_dirs"])
            return snapshot


runner = PipelineRunner()
