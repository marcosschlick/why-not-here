from src import config
from src.grid.grid import Grid
from src.isp.semantics import SemanticModifications

TERRAIN_NAMES = {
    "COMPACTED_SOIL": "compacted soil",
    "GRASS": "grass",
    "DRY_VEGETATION": "dry vegetation",
    "SAND": "sand",
    "MUD": "mud",
}


def generate_explanation_text(
    modifications: SemanticModifications | None,
    grid: Grid | None = None,
    fallback_reason: str | None = None,
    solver_status: str = "OPTIMAL",
) -> str:
    subgraph_only = solver_status == "SUBGRAPH_OPTIMAL_ONLY"
    subgraph_message = (
        "The candidate makes the alternative route p' optimal only within the reduced subgraph. "
        "Global optimality validation failed; there is no global optimality certification."
    )
    if modifications is None:
        if subgraph_only:
            return subgraph_message
        if fallback_reason:
            return fallback_reason
        return "No feasible intervention was found to make the alternative route p' optimal."

    has_terrain = bool(modifications.terrain_nodes)
    obstacle_nodes = modifications.obstacle_nodes
    if grid is not None:
        obstacle_nodes = [u for u in obstacle_nodes if grid.get_cell(u).obstacle != 0]
    has_obstacle = bool(obstacle_nodes)
    has_slope = bool(modifications.slope_edges)

    if not has_terrain and not has_obstacle and not has_slope:
        if subgraph_only:
            return (
                subgraph_message
                + " No environmental changes were required within the subgraph."
            )
        return "The alternative route p' already has the same estimated traversal time as the optimal route p*, so no environmental changes are needed."

    lines = [
        subgraph_message + " Candidate interventions:"
        if subgraph_only
        else (
            "This contrastive explanation describes why the planner selected the optimal route p* "
            "over the alternative route p': conditions along p' increase the robot's traversal time. "
            "The minimum environmental changes needed to make the alternative route p' optimal are:"
        )
    ]

    if has_terrain:
        target_name = config.TARGET_TERRAIN.lower().replace("_", " ")
        terrain_count = len(modifications.terrain_nodes)
        terrain_cell_label = "cell" if terrain_count == 1 else "cells"
        if grid is not None:
            counts: dict[str, int] = {}
            for u in modifications.terrain_nodes:
                t = grid.get_cell(u).terrain
                name = TERRAIN_NAMES.get(t, t.lower().replace("_", " "))
                counts[name] = counts.get(name, 0) + 1
            details = ", ".join(
                f"{name} ({cnt} {'cell' if cnt == 1 else 'cells'})"
                for name, cnt in counts.items()
            )
            lines.append(
                f"- Convert {terrain_count} terrain {terrain_cell_label} "
                f"({details}) to the target terrain ({target_name})."
            )
        else:
            lines.append(
                f"- Convert {terrain_count} terrain {terrain_cell_label} "
                f"to the target terrain ({target_name})."
            )

    if has_obstacle:
        obstacle_count = len(obstacle_nodes)
        obstacle_cell_label = "cell" if obstacle_count == 1 else "cells"
        lines.append(
            f"- Remove physical obstacles blocking {obstacle_count} "
            f"{obstacle_cell_label} on the alternative route."
        )

    if has_slope:
        slope_count = len(modifications.slope_edges)
        if slope_count == 1:
            lines.append(
                "- Level 1 steep-slope segment that slows or prevents continuous robot traversal."
            )
        else:
            lines.append(
                f"- Level {slope_count} steep-slope segments "
                "that slow or prevent continuous robot traversal."
            )

    if not subgraph_only:
        lines.append(
            "Without these changes, the alternative route has a higher traversal cost and increases mission time."
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
