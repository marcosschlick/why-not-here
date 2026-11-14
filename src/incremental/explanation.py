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
    if modifications.model == "BRANDAO":
        improved = sum(
            grid.get_cell(node).terrain == "FOREST" and target == "GRASS"
            for node, target in modifications.terrain_assignments
        )
        worsened = sum(
            grid.get_cell(node).terrain == "GRASS" and target == "FOREST"
            for node, target in modifications.terrain_assignments
        )
        lines = [
            (
                "In this Brandao-inspired 2D-grid adaptation, the contrast between the chosen route p* "
                "and the desired route p' depends on the prepared map's fast and slow terrain assignments. "
                "The candidate terrain assignments seek to make p' optimal in the modified prepared model:"
            ),
            f"- Change {improved} cells from slow to fast terrain and {worsened} cells from fast to slow terrain, including changes on competing routes when needed.",
            f"- Weighted intervention cost: {objective_cost}. Each changed cell costs 1 inside the desired path's interior and 10 outside it. Preparation conversions are excluded.",
        ]
    else:
        lines = [
            "This Eder-inspired 2D-grid explanation contrasts the chosen optimal route p* with the alternative route p'. "
            "The candidate changes concern terrain traversability, slope, environmental speed limits and hypothetical robot capabilities:"
            if original_optimal_available
            else "No feasible route existed in the original map. The following candidate changes propose how the desired route p' could become traversable and optimal:",
        ]
        for record in modifications.cell_openings:
            reasons = []
            if record.original_obstacle:
                reasons.append("a physical obstacle")
            if record.impassable_terrain:
                reasons.append(
                    f"impassable {record.original_terrain.lower().replace('_', ' ')} terrain"
                )
            lines.append(
                f"- Make cell {record.cell} traversable by resolving {' and '.join(reasons)} as one intervention. "
                f"Preserve its terrain class and use {record.opened_speed_mps:g} m/s before edge slope effects."
            )
        for record in modifications.slope_adjustments:
            lines.append(
                f"- Make directed edge {record.edge[0]} -> {record.edge[1]} traversable by adjusting its effective slope "
                f"from {record.original_slope_deg:+.2f} to {record.effective_slope_deg:+g} degrees. Elevations and the reverse edge are unchanged."
            )
        for records, description in (
            (
                modifications.environmental_speed_edges,
                "Remove the environmental speed limitation",
            ),
            (
                modifications.robot_capability_edges,
                "Hypothetically increase the robot's speed capability",
            ),
        ):
            for record in records:
                lines.append(
                    f"- {description} on directed edge {record.edge[0]} -> {record.edge[1]}: "
                    f"effective speed {record.target_speed_mps:g} m/s, original eligibility reference {record.reference_speed_mps:.6g} m/s. "
                    "The resulting cost is distance divided by this speed; passage corrections remain separate interventions."
                )
        if len(lines) == 1:
            lines.append("No interventions are proposed.")
        lines.append(
            f"Each cell opening and each directed edge intervention costs 1; total intervention cost: {objective_cost}."
        )
    if validated:
        lines.append(
            "The alternative route is physically traversable and globally optimal in the modified model within the total-cost tolerance; ties are permitted."
        )
    elif stop_reason == "SUBGRAPH_OPTIMAL_ONLY":
        lines.append(
            "The candidate is optimal only within the reduced subgraph. Full-grid validation failed."
        )
    else:
        lines.append(
            "This remains an unvalidated candidate: global route validation has not passed."
        )
    lines.append(
        "The minimum intervention objective is certified within the declared domain."
        if objective_certified
        else "The minimum intervention objective is not certified."
    )
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
