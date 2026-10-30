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
    uncertified_candidate = solver_status in {
        "TIMEOUT",
        "MAX_ITERATIONS_EXCEEDED",
    }
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
    has_water = bool(modifications.water_nodes)
    has_robot_speed = bool(modifications.robot_speed_edges)

    if not any((has_terrain, has_obstacle, has_slope, has_water, has_robot_speed)):
        if subgraph_only:
            return (
                subgraph_message
                + " No interventions were required within the subgraph."
            )
        if uncertified_candidate:
            return (
                "A candidate intervention was found, but global optimality was not certified before the run stopped. "
                "The candidate contains no semantic changes."
            )
        return "The alternative route p' already has the same estimated traversal time as the optimal route p*, so no interventions are needed."

    lines = [
        subgraph_message + " Candidate interventions:"
        if subgraph_only
        else (
            "A candidate intervention was found, but global optimality was not certified before the run stopped. "
            "Candidate interventions:"
            if uncertified_candidate
            else (
                "This contrastive explanation describes why the planner selected the optimal route p* "
                "over the alternative route p': terrain, traversability, and robot capabilities determine their traversal times. "
                "The minimum interventions needed to make the alternative route p' optimal are:"
            )
        )
    ]

    if has_terrain:
        counts: dict[tuple[str, str], int] = {}
        for node, terrain in modifications.terrain_assignments:
            original = (
                grid.get_cell(node).terrain if grid is not None else "original terrain"
            )
            original_name = TERRAIN_NAMES.get(
                original, original.lower().replace("_", " ")
            )
            final_name = TERRAIN_NAMES.get(terrain, terrain.lower().replace("_", " "))
            key = (original_name, final_name)
            counts[key] = counts.get(key, 0) + 1
        for (original_name, final_name), count in counts.items():
            cell_label = "cell" if count == 1 else "cells"
            lines.append(
                f"- Convert {count} terrain {cell_label} from {original_name} to {final_name} along the desired or accumulated competing routes."
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

    if has_water:
        water_count = len(modifications.water_nodes)
        water_cell_label = "cell" if water_count == 1 else "cells"
        lines.append(
            f"- Make {water_count} water {water_cell_label} traversable at the base-terrain speed while preserving water terrain."
        )

    if has_robot_speed:
        count = len(modifications.robot_speed_edges)
        edge_label = "edge" if count == 1 else "edges"
        speed = (
            grid.robot_speed_theoretical
            if grid is not None
            else config.ROBOT_SPEED_THEORETICAL
        )
        lines.append(
            f"- Increase the robot speed capability to {speed:g} m/s on {count} directed {edge_label} of the alternative route."
        )

    if not subgraph_only and not uncertified_candidate:
        lines.append(
            "These interventions make the alternative route optimal under the modified traversal model."
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
