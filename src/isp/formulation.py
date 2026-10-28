import cvxpy as cp
import numpy as np
from scipy.sparse import csr_matrix, lil_matrix

from ..config import (
    BASE_TERRAIN,
    IMPASSABLE_TERRAINS,
    WATER_TERRAIN,
)
from ..grid import Grid
from .mccormick import linearize_binary_product, linearize_mccormick_terms
from .semantics import ISPSemantics
from .types import MIPFormulation


def compute_affine_edge_costs(
    grid: Grid,
    isp: ISPSemantics,
    custom_edge_costs: dict[tuple[tuple[int, int], tuple[int, int]], float] | None,
    v_base_default: float,
) -> tuple[
    np.ndarray,
    np.ndarray,
    np.ndarray,
    csr_matrix | None,
    csr_matrix | None,
    csr_matrix | None,
    csr_matrix | None,
    csr_matrix | None,
    list[tuple[int, int, int, float]],
]:
    num_edges = len(isp.edges)
    w_min = np.zeros(num_edges, dtype=np.float64)
    c_base = np.zeros(num_edges, dtype=np.float64)
    c_blocked = np.zeros(num_edges, dtype=np.float64)

    M_terrain = (
        lil_matrix((num_edges, isp.num_terrain_vars), dtype=np.float64)
        if isp.num_terrain_vars > 0
        else None
    )
    M_obs = (
        lil_matrix((num_edges, isp.num_obstacle_vars), dtype=np.float64)
        if isp.num_obstacle_vars > 0
        else None
    )
    M_slope = (
        lil_matrix((num_edges, isp.num_slope_vars), dtype=np.float64)
        if isp.num_slope_vars > 0
        else None
    )
    M_slope_blocked = M_slope.copy() if M_slope is not None else None
    M_water = (
        lil_matrix((num_edges, isp.num_water_vars), dtype=np.float64)
        if isp.num_water_vars > 0
        else None
    )
    cross_items: list[tuple[int, int, int, float]] = []

    max_speed = grid.robot_speed_theoretical

    for k, (u, v) in enumerate(isp.edges):
        d_uv = grid.get_distance(u, v)
        w_min[k] = d_uv / max_speed

        if custom_edge_costs and (u, v) in custom_edge_costs:
            c_base[k] = custom_edge_costs[(u, v)]
            continue

        cell_u = grid.get_cell(u)
        cell_v = grid.get_cell(v)
        v_u = grid.speeds.get(cell_u.terrain, 0.0)
        v_v = grid.speeds.get(cell_v.terrain, 0.0)
        v_u_eff = v_u if v_u > 0.0 else v_base_default
        v_v_eff = v_v if v_v > 0.0 else v_base_default

        c_u0 = d_uv / (2.0 * v_u_eff)
        c_v0 = d_uv / (2.0 * v_v_eff)
        t_base0 = c_u0 + c_v0
        slope_pen = grid.get_slope_penalty(u, v)
        t_cost0 = t_base0 * (1.0 + slope_pen)

        o_u = 1.0 if cell_u.obstacle != 0 else 0.0
        o_v = 1.0 if cell_v.obstacle != 0 else 0.0
        water_u = cell_u.terrain == WATER_TERRAIN and u not in grid.water_overrides
        water_v = cell_v.terrain == WATER_TERRAIN and v not in grid.water_overrides
        t_u = float(
            cell_u.terrain in IMPASSABLE_TERRAINS
            and (cell_u.terrain != WATER_TERRAIN or water_u)
        )
        t_v = float(
            cell_v.terrain in IMPASSABLE_TERRAINS
            and (cell_v.terrain != WATER_TERRAIN or water_v)
        )

        s_viol = (
            1.0
            if (
                abs(grid.get_slope(u, v)) > grid.max_slope_deg
                and (u, v) not in grid.leveled_slopes
                and (v, u) not in grid.leveled_slopes
            )
            else 0.0
        )

        c_base[k] = t_cost0
        c_blocked[k] = isp.big_m * (o_u + o_v + t_u + t_v + s_viol)
        if M_terrain is not None:
            for node, original_speed in ((u, v_u_eff), (v, v_v_eff)):
                if node not in isp.terrain_to_idx:
                    continue
                start = isp.terrain_to_idx[node] * len(isp.terrain_classes)
                for j, terrain in enumerate(isp.terrain_classes):
                    delta = (d_uv / 2.0) * (
                        1.0 / grid.speeds[terrain] - 1.0 / original_speed
                    )
                    M_terrain[k, start + j] += delta * (1.0 + slope_pen)
                    if (u, v) in isp.slope_to_idx and delta * slope_pen != 0.0:
                        cross_items.append(
                            (k, start + j, isp.slope_to_idx[(u, v)], -delta * slope_pen)
                        )

        if M_obs is not None:
            if u in isp.obstacle_to_idx:
                M_obs[k, isp.obstacle_to_idx[u]] += isp.big_m * o_u
            if v in isp.obstacle_to_idx:
                M_obs[k, isp.obstacle_to_idx[v]] += isp.big_m * o_v

        if M_water is not None:
            if water_u and u in isp.water_to_idx:
                M_water[k, isp.water_to_idx[u]] += isp.big_m
            if water_v and v in isp.water_to_idx:
                M_water[k, isp.water_to_idx[v]] += isp.big_m

        if M_slope is not None and (u, v) in isp.slope_to_idx:
            s_idx = isp.slope_to_idx[(u, v)]
            M_slope[k, s_idx] += t_base0 * slope_pen
            M_slope_blocked[k, s_idx] += isp.big_m * s_viol

        if (u, v) in grid.robot_speed_edges:
            c_base[k] = d_uv / grid.robot_speed_theoretical
            if M_terrain is not None:
                M_terrain[k, :] = 0.0
            if M_slope is not None:
                M_slope[k, :] = 0.0
            cross_items = [item for item in cross_items if item[0] != k]

    return (
        w_min,
        c_base,
        c_blocked,
        M_terrain.tocsr() if M_terrain is not None else None,
        M_obs.tocsr() if M_obs is not None else None,
        M_slope.tocsr() if M_slope is not None else None,
        M_water.tocsr() if M_water is not None else None,
        M_slope_blocked.tocsr() if M_slope_blocked is not None else None,
        cross_items,
    )


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
    z_water = (
        cp.Variable(isp.num_water_vars, boolean=True)
        if isp.num_water_vars > 0
        else None
    )

    z_robot_speed = (
        cp.Variable(isp.num_robot_speed_vars, boolean=True)
        if isp.num_robot_speed_vars > 0
        else None
    )

    v_base_default = grid.speeds[BASE_TERRAIN]

    (
        w_min,
        c_base,
        c_blocked,
        M_terrain,
        M_obs,
        M_slope,
        M_water,
        M_slope_blocked,
        cross_items,
    ) = compute_affine_edge_costs(
        grid=grid,
        isp=isp,
        custom_edge_costs=custom_edge_costs,
        v_base_default=v_base_default,
    )

    travel_time = cp.Constant(c_base)
    blocking_cost = cp.Constant(c_blocked)
    if z_terrain is not None and M_terrain is not None:
        travel_time = travel_time + M_terrain @ z_terrain
    if z_obstacle is not None and M_obs is not None:
        blocking_cost = blocking_cost - M_obs @ z_obstacle
    if z_slope is not None and M_slope is not None:
        travel_time = travel_time - M_slope @ z_slope
        blocking_cost = blocking_cost - M_slope_blocked @ z_slope
    if z_water is not None and M_water is not None:
        blocking_cost = blocking_cost - M_water @ z_water

    cross_term, extra_constraints = linearize_mccormick_terms(
        cross_items=cross_items,
        num_edges=num_edges,
        z_terrain=z_terrain,
        z_slope=z_slope,
    )
    if cross_term is not None:
        travel_time = travel_time + cross_term

    w_prime = travel_time + blocking_cost
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

    if z_water is not None:
        extra_constraints.append(z_water == 1.0)
    if z_obstacle is not None:
        extra_constraints.append(z_obstacle == 1.0)
    if z_slope is not None:
        for (u, v), s_idx in isp.slope_to_idx.items():
            if abs(grid.get_slope(u, v)) > grid.max_slope_deg:
                extra_constraints.append(z_slope[s_idx] == 1.0)

    obj_terms = [
        cp.sum(variable)
        for variable in (z_obstacle, z_slope, z_water, z_robot_speed)
        if variable is not None
    ]

    if z_terrain is not None:
        class_count = len(isp.terrain_classes)
        obj_terms.append(
            cp.sum(
                cp.hstack(
                    [
                        1.0
                        - z_terrain[
                            i * class_count
                            + isp.terrain_class_to_idx[grid.get_cell(node).terrain]
                        ]
                        for i, node in enumerate(isp.terrain_nodes)
                    ]
                )
            )
        )

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
        z_water=z_water,
        z_robot_speed=z_robot_speed,
    )
