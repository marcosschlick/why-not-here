from src.grid.grid import Grid
from src.isp.types import SemanticModifications


def generate_explanation_text(
    modifications: SemanticModifications | None,
    grid: Grid | None = None,
    solver_status: str = "CANDIDATE_UNVALIDATED",
    stop_reason: str | None = None,
    objective_cost: int | None = None,
    objective_certified: bool = False,
    original_optimal_available: bool = True,
) -> str:
    if stop_reason == "COST_MODEL_MISMATCH":
        return (
            "Execution error: modeled edge costs differ from the costs applied to the candidate map. "
            "Physical validation is recorded separately; this execution is not successful or certified."
        )
    if modifications is None:
        reason = stop_reason or solver_status
        if reason == "INFEASIBLE":
            return "The current formulation is infeasible within the declared intervention domain. No candidate explanation is available."
        if reason in {
            "TIME_BUDGET_EXHAUSTED",
            "TIME_LIMIT",
            "SOLVER_LIMIT",
            "INTERRUPTED",
        }:
            return "The execution stopped at a time or solver limit before a usable candidate was available. Feasibility remains undetermined."
        if reason in {
            "ERROR",
            "REQUEST_ERROR",
            "SOLVER_ERROR",
            "SOLVER_NOT_FOUND",
            "SOLVER_FAILED",
            "INCONSISTENT_COMPETING_PATH",
        }:
            return "The execution failed before a usable candidate was available. See the recorded execution error."
        return "No usable candidate was returned. This inconclusive result does not establish infeasibility."
    validated = solver_status == "PATH_VALIDATED"
    lines = [
        "The alternative route is validated with these changes:"
        if validated
        else "These proposed changes are an unvalidated candidate for the alternative route:"
    ]
    if modifications.model == "BRANDAO":
        improved = sum(target == "GRASS" for _, target in modifications.terrain_assignments)
        worsened = sum(target == "FOREST" for _, target in modifications.terrain_assignments)
        if improved:
            lines.append(f"- Change {improved} terrain cells from slow to fast.")
        if worsened:
            lines.append(f"- Change {worsened} terrain cells from fast to slow.")
    else:
        if not original_optimal_available:
            lines.insert(0, "No route was available on the original map.")
        if modifications.cell_openings:
            obstacles = sum(record.original_obstacle != 0 for record in modifications.cell_openings)
            impassable = sum(record.impassable_terrain for record in modifications.cell_openings)
            lines.append(
                f"- Make {len(modifications.cell_openings)} blocked cells traversable "
                f"({obstacles} with obstacles, {impassable} with impassable terrain; causes may overlap)."
            )
        groups = (
            (len(modifications.slope_adjustments), "directed slopes adjusted"),
            (len(modifications.environmental_speed_edges), "environmental speed limits removed"),
            (len(modifications.robot_capability_edges), "hypothetical robot speed capability increases"),
        )
        lines.extend(f"- {count} {description}." for count, description in groups if count)
    if not any(line.startswith("- ") for line in lines):
        lines.append("- No interventions are proposed.")
    if validated:
        lines.append("The alternative route is globally optimal within the allowed tolerance; ties are possible.")
    elif stop_reason == "SUBGRAPH_OPTIMAL_ONLY":
        lines.append("The route passed the reduced-subgraph check but not global validation.")
    else:
        lines.append("Global validation has not passed.")
    if objective_certified:
        lines.append("The intervention objective is certified minimal within the declared domain.")
    return "\n".join(lines)


def generate_cost_baseline_justification(
    cost_p_star: float, cost_p_prime: float
) -> str:
    if cost_p_star == float("inf"):
        return "No feasible route was found on the current map for the selected start and goal."
    if cost_p_prime == float("inf"):
        return (
            f"The optimal route p* is feasible (estimated traversal time: {cost_p_star:.2f} s), "
            "while the alternative route p' is impassable under current terrain conditions "
            "(infinite traversal time due to impassable terrain, obstacles, or steep slopes)."
        )
    diff = cost_p_prime - cost_p_star
    if abs(diff) < 1e-4:
        return (
            f"The alternative route p' has the same estimated traversal time as the optimal route p* "
            f"({cost_p_star:.2f} s)."
        )
    pct = (diff / cost_p_star * 100.0) if cost_p_star > 0.0 else 0.0
    return (
        f"The optimal route p* was selected because it is faster: estimated traversal time of {cost_p_star:.2f} s "
        f"compared with {cost_p_prime:.2f} s for the alternative route p' "
        f"(a difference of {diff:.2f} s, making the alternative route {pct:.1f}% slower)."
    )
