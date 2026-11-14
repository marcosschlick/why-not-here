import hashlib
import json
import math
import threading
from dataclasses import asdict
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from src.isp.types import marker_modifications


def finite_data(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: finite_data(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [finite_data(item) for item in value]
    return value


def content_id(value) -> str:
    return hashlib.sha256(
        json.dumps(
            finite_data(value), sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


def execution_error(result) -> str | None:
    failures = {
        "ERROR",
        "REQUEST_ERROR",
        "SOLVER_ERROR",
        "SOLVER_NOT_FOUND",
        "SOLVER_FAILED",
        "INCONSISTENT_COMPETING_PATH",
    }
    reason = result.metrics.get("stop_reason")
    if reason == "COST_MODEL_MISMATCH":
        return "Modeled edge costs differ from the costs applied to the candidate map."
    if reason in failures or result.solver_status in failures:
        return (
            result.metrics.get("error")
            or result.metrics.get("solver", {}).get("error")
            or reason
            or result.solver_status
        )
    return None


def serialize_result(result) -> dict:
    modifications = None
    if result.modifications is not None:
        modifications = asdict(marker_modifications(result.modifications))
        for key, attribute in (
            ("terrain", "terrain_nodes"),
            ("obstacle", "obstacle_nodes"),
            ("slope", "slope_edges"),
            ("opened_terrain", "opened_terrain_nodes"),
            ("robot_speed", "robot_speed_edges"),
        ):
            modifications[key] = len(getattr(result.modifications, attribute))
    return finite_data(
        {
            "execution_status": "failed" if execution_error(result) else "completed",
            "execution_error": execution_error(result),
            "success": result.success,
            "solver_status": result.solver_status,
            "runtime_sec": result.runtime_sec,
            "iterations": result.iterations,
            "competing_paths_count": result.competing_paths_count,
            "graph_nodes": result.graph_nodes,
            "graph_edges": result.graph_edges,
            "original_optimal_path": result.original_optimal_path,
            "original_optimal_cost": result.original_optimal_cost,
            "original_alternative_cost": result.metrics.get(
                "original_alternative_cost"
            ),
            "final_alternative_cost": result.final_alternative_cost,
            "path_metrics": result.path_metrics,
            "iteration_metrics": result.iteration_metrics,
            "explanation_text": result.explanation_text,
            "cost_baseline_text": result.cost_baseline_text,
            "modifications": modifications,
            "metrics": {
                **result.metrics,
                "intervention_details": asdict(result.modifications)
                if result.modifications is not None
                else None,
            },
        }
    )


def runtime_versions() -> dict:
    import platform

    values = {"python": platform.python_version()}
    for package in ("cvxpy", "highspy", "numpy", "scipy", "gurobipy"):
        try:
            values[package] = version(package)
        except PackageNotFoundError:
            values[package] = None
    return values


class ScenarioMemory:
    def __init__(self):
        self.interval_sec = 0.05
        self.initial = self._rss()
        self.peak = self.initial
        self.samples = 0
        self.stopped = threading.Event()
        self.thread = None

    @staticmethod
    def _rss():
        try:
            for line in Path("/proc/self/status").read_text().splitlines():
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) * 1024
        except (OSError, ValueError):
            pass
        return None

    def _sample(self):
        value = self._rss()
        if value is not None:
            self.peak = max(self.peak or 0, value)
            self.samples += 1

    def _loop(self):
        while not self.stopped.wait(self.interval_sec):
            self._sample()

    def start(self):
        if self.initial is not None:
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()

    def finish(self) -> dict:
        self.stopped.set()
        if self.thread is not None:
            self.thread.join()
            self._sample()
        return {
            "method": "linux_process_rss_sampling"
            if self.initial is not None
            else None,
            "initial_bytes": self.initial,
            "sampled_peak_bytes": self.peak,
            "sampling_interval_sec": self.interval_sec
            if self.initial is not None
            else None,
            "samples": self.samples,
            "exact_scenario_peak_bytes": None,
        }
