import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field


class ScenarioDeadlineExceeded(RuntimeError):
    pass


_active_budget: ContextVar["ScenarioBudget | None"] = ContextVar(
    "isp_budget", default=None
)


@dataclass
class ScenarioBudget:
    limit_sec: float
    started_ns: int = field(default_factory=time.perf_counter_ns)
    timings: dict[str, float] = field(
        default_factory=lambda: {
            "preparation_sec": 0.0,
            "model_build_sec": 0.0,
            "solver_sec": 0.0,
            "validation_sec": 0.0,
        }
    )

    @property
    def elapsed_sec(self) -> float:
        return (time.perf_counter_ns() - self.started_ns) / 1e9

    @property
    def remaining_sec(self) -> float:
        return max(0.0, self.limit_sec - self.elapsed_sec)

    def check(self) -> None:
        if self.remaining_sec <= 0.0:
            raise ScenarioDeadlineExceeded("The scenario time budget was exhausted.")

    @contextmanager
    def phase(self, name: str):
        started = time.perf_counter_ns()
        try:
            yield
        finally:
            self.timings[name] += (time.perf_counter_ns() - started) / 1e9

    @contextmanager
    def activate(self):
        token = _active_budget.set(self)
        try:
            yield self
        finally:
            _active_budget.reset(token)


def current_budget() -> ScenarioBudget | None:
    return _active_budget.get()


def check_deadline() -> None:
    budget = current_budget()
    if budget is not None:
        budget.check()
