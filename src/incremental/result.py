from dataclasses import dataclass

from src.isp.semantics import SemanticModifications


@dataclass
class ClosedLoopResult:
    success: bool
    modifications: SemanticModifications | None
    explanation_text: str
    iterations: int
    competing_paths_count: int
    original_optimal_path: list[tuple[int, int]]
    original_optimal_cost: float
    final_alternative_cost: float
    runtime_sec: float
    solver_status: str
    reduction_method: str = "NONE"
    cost_baseline_text: str = ""
