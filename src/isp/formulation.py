import cvxpy as cp
import numpy as np
from scipy.sparse import lil_matrix

from ..config import BASE_TERRAIN
from ..grid import Grid
from .budget import check_deadline
from .mccormick import linearize_binary_product, linearize_mccormick_terms
from .semantics import ISPSemantics, terrain_change_weight
from .types import MIPFormulation


def compute_affine_edge_costs(grid: Grid, isp: ISPSemantics, custom_edge_costs):
    count = len(isp.edges)
    baseline = np.zeros(count)
    minimum = np.zeros(count)
    terrain_matrix = (
        lil_matrix((count, isp.num_terrain_vars)) if isp.num_terrain_vars else None
    )
    slope_matrix = (
        lil_matrix((count, isp.num_slope_vars)) if isp.num_slope_vars else None
    )
    cross_items = []
    maximum_speed = (
        max(grid.speeds.values())
        if grid.isp_model == "BRANDAO"
        else grid.robot_speed_theoretical
    )
    for k, (u, v) in enumerate(isp.edges):
        if k % 256 == 0:
            check_deadline()
        distance = grid.get_distance(u, v)
        minimum[k] = distance / maximum_speed
        if custom_edge_costs and (u, v) in custom_edge_costs:
            baseline[k] = custom_edge_costs[(u, v)]
            continue
        speeds = [grid._get_effective_speed(node) for node in (u, v)]
        speeds = [speed if speed > 0 else grid.speeds[BASE_TERRAIN] for speed in speeds]
        slope = grid.get_slope_penalty(u, v)
        base_time = distance * 0.5 * sum(1 / speed for speed in speeds)
        baseline[k] = base_time * (1 + slope)
        if (u, v) in grid.robot_speed_edges:
            baseline[k] = distance / grid.robot_speed_theoretical
            continue
        if terrain_matrix is not None:
            for node, speed in zip((u, v), speeds, strict=True):
                if node not in isp.terrain_to_idx:
                    continue
                first = isp.terrain_to_idx[node] * len(isp.terrain_classes)
                for j, terrain in enumerate(isp.terrain_classes):
                    delta = distance * 0.5 * (1 / grid.speeds[terrain] - 1 / speed)
                    terrain_matrix[k, first + j] += delta * (1 + slope)
                    if (u, v) in isp.slope_to_idx and delta * slope:
                        cross_items.append(
                            (k, first + j, isp.slope_to_idx[(u, v)], -delta * slope)
                        )
        if slope_matrix is not None and (u, v) in isp.slope_to_idx:
            slope_matrix[k, isp.slope_to_idx[(u, v)]] = base_time * slope
    return minimum, baseline, terrain_matrix, slope_matrix, cross_items


def build_base_formulation(
    grid: Grid,
    alternative_path: list[tuple[int, int]],
    active_nodes: set[tuple[int, int]] | None = None,
    active_edges: set[tuple[tuple[int, int], tuple[int, int]]] | None = None,
    custom_edge_costs: dict[tuple[tuple[int, int], tuple[int, int]], float]
    | None = None,
    terrain_decision_nodes: set[tuple[int, int]] | None = None,
) -> MIPFormulation | None:
    isp = ISPSemantics(
        grid=grid,
        candidate_path=alternative_path,
        active_nodes=active_nodes,
        active_edges=active_edges,
        custom_edge_costs=custom_edge_costs,
        terrain_decision_nodes=terrain_decision_nodes,
    )

    num_edges = len(isp.edges)
    x_alt = np.zeros(num_edges, dtype=np.float64)
    for r in range(len(alternative_path) - 1):
        edge = (alternative_path[r], alternative_path[r + 1])
        if edge not in isp.edge_to_idx:
            return None
        x_alt[isp.edge_to_idx[edge]] += 1.0

    z_terrain = (
        cp.Variable(isp.num_terrain_vars, boolean=True)
        if isp.num_terrain_vars > 0
        else None
    )
    z_obstacle = (
        cp.Variable(isp.num_obstacle_vars, boolean=True)
        if isp.num_obstacle_vars > 0
        else None
    )
    z_slope = (
        cp.Variable(isp.num_slope_vars, boolean=True)
        if isp.num_slope_vars > 0
        else None
    )
    z_opened_terrain = (
        cp.Variable(isp.num_opened_terrain_vars, boolean=True)
        if isp.num_opened_terrain_vars > 0
        else None
    )

    z_robot_speed = (
        cp.Variable(isp.num_robot_speed_vars, boolean=True)
        if isp.num_robot_speed_vars > 0
        else None
    )

    w_min, baseline, terrain_matrix, slope_matrix, cross_items = (
        compute_affine_edge_costs(grid, isp, custom_edge_costs)
    )
    travel_time = cp.Constant(baseline)
    if z_terrain is not None:
        travel_time = travel_time + terrain_matrix.tocsr() @ z_terrain
    if z_slope is not None:
        travel_time = travel_time - slope_matrix.tocsr() @ z_slope

    cross_term, extra_constraints = linearize_mccormick_terms(
        cross_items=cross_items,
        num_edges=num_edges,
        z_terrain=z_terrain,
        z_slope=z_slope,
    )
    if cross_term is not None:
        travel_time = travel_time + cross_term

    w_prime = travel_time
    if z_robot_speed is not None:
        min_speed = min(
            speed
            for speed in grid.speeds.values()
            if np.isfinite(speed) and speed > 0.0
        )
        speed_adjustments = []
        for edge in isp.robot_speed_edges:
            k = isp.edge_to_idx[edge]
            binary = z_robot_speed[isp.robot_speed_to_idx[edge]]
            distance = grid.get_distance(*edge)
            upper_bound = distance / min_speed * (1.0 + grid.get_slope_penalty(*edge))
            product, constraints = linearize_binary_product(
                binary, travel_time[k], upper_bound
            )
            extra_constraints.extend(constraints)
            speed_adjustments.append(
                (k, distance / grid.robot_speed_theoretical * binary - product)
            )
        speed_matrix = lil_matrix((num_edges, len(speed_adjustments)), dtype=np.float64)
        for j, (k, _) in enumerate(speed_adjustments):
            speed_matrix[k, j] = 1.0
        w_prime = w_prime + speed_matrix.tocsr() @ cp.hstack(
            [value for _, value in speed_adjustments]
        )

    if z_terrain is not None:
        class_count = len(isp.terrain_classes)
        for i in range(len(isp.terrain_nodes)):
            extra_constraints.append(
                cp.sum(z_terrain[i * class_count : (i + 1) * class_count]) == 1.0
            )
            original_speed = grid.speeds[grid.get_cell(isp.terrain_nodes[i]).terrain]
            for j, terrain in enumerate(isp.terrain_classes):
                if grid.isp_model == "NORMAL" and grid.speeds[terrain] < original_speed:
                    extra_constraints.append(z_terrain[i * class_count + j] == 0.0)

    if z_opened_terrain is not None:
        extra_constraints.append(z_opened_terrain == 1.0)
    if z_obstacle is not None:
        extra_constraints.append(z_obstacle == 1.0)
    if z_slope is not None:
        for (u, v), s_idx in isp.slope_to_idx.items():
            if abs(grid.get_slope(u, v)) > grid.max_slope_deg:
                extra_constraints.append(z_slope[s_idx] == 1.0)

    obj_terms = [
        cp.sum(variable)
        for variable in (z_obstacle, z_slope, z_opened_terrain, z_robot_speed)
        if variable is not None
    ]

    if z_terrain is not None:
        class_count = len(isp.terrain_classes)
        changed_cells = cp.Variable(len(isp.terrain_nodes), nonneg=True)
        for index, node in enumerate(isp.terrain_nodes):
            original_label = (
                index * class_count
                + isp.terrain_class_to_idx[grid.get_cell(node).terrain]
            )
            extra_constraints.append(
                changed_cells[index] + z_terrain[original_label] == 1.0
            )
        path_interior = set(alternative_path[1:-1])
        weights = [
            terrain_change_weight(grid, node, path_interior)
            for node in isp.terrain_nodes
        ]
        obj_terms.append(cp.sum(cp.multiply(weights, changed_cells)))

    return MIPFormulation(
        isp=isp,
        x_alt=x_alt,
        w_prime=w_prime,
        w_min=w_min,
        extra_constraints=extra_constraints,
        obj_terms=obj_terms,
        z_terrain=z_terrain,
        z_obstacle=z_obstacle,
        z_slope=z_slope,
        z_opened_terrain=z_opened_terrain,
        z_robot_speed=z_robot_speed,
    )
