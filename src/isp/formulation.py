import cvxpy as cp
import numpy as np

from ..config import (
    BASE_TERRAIN,
    TARGET_TERRAIN,
    V_MAX,
)
from ..grid import Grid
from .mccormick import linearize_mccormick_terms
from .semantics import ISPSemantics
from .types import MIPFormulation


def compute_affine_edge_costs(
    grid: Grid,
    isp: ISPSemantics,
    custom_edge_costs: dict[tuple[tuple[int, int], tuple[int, int]], float] | None,
    v_target: float,
    v_base_default: float,
) -> tuple[
    np.ndarray,
    np.ndarray,
    np.ndarray | None,
    np.ndarray | None,
    np.ndarray | None,
    list[tuple[int, int, int, float]],
]:
    num_edges = len(isp.edges)
    w_min = np.zeros(num_edges, dtype=np.float64)
    c_base = np.zeros(num_edges, dtype=np.float64)

    M_terrain = (
        np.zeros((num_edges, isp.num_terrain_vars), dtype=np.float64)
        if isp.num_terrain_vars > 0
        else None
    )
    M_obs = (
        np.zeros((num_edges, isp.num_obstacle_vars), dtype=np.float64)
        if isp.num_obstacle_vars > 0
        else None
    )
    M_slope = (
        np.zeros((num_edges, isp.num_slope_vars), dtype=np.float64)
        if isp.num_slope_vars > 0
        else None
    )
    cross_items: list[tuple[int, int, int, float]] = []

    max_speed = max(grid.speeds.values()) if (grid.speeds and len(grid.speeds) > 0) else V_MAX

    for k, (u, v) in enumerate(isp.edges):
        d_uv = grid.get_distance(u, v)
        w_min[k] = d_uv / max_speed

        if custom_edge_costs and (u, v) in custom_edge_costs:
            c_base[k] = custom_edge_costs[(u, v)]
            continue

        v_u = grid.speeds.get(grid.get_cell(u).terrain, 0.0)
        v_v = grid.speeds.get(grid.get_cell(v).terrain, 0.0)
        v_u_eff = v_u if v_u > 0.0 else v_base_default
        v_v_eff = v_v if v_v > 0.0 else v_base_default

        c_u0 = d_uv / (2.0 * v_u_eff)
        c_v0 = d_uv / (2.0 * v_v_eff)
        t_base0 = c_u0 + c_v0
        slope_pen = grid.get_slope_penalty(u, v)
        t_cost0 = t_base0 * (1.0 + slope_pen)

        c_u1 = (d_uv / 2.0) * ((1.0 / v_target) - (1.0 / v_u_eff)) * (1.0 + slope_pen)
        c_v1 = (d_uv / 2.0) * ((1.0 / v_target) - (1.0 / v_v_eff)) * (1.0 + slope_pen)

        o_u = 1.0 if grid.get_cell(u).is_blocked else 0.0
        o_v = 1.0 if grid.get_cell(v).is_blocked else 0.0

        s_viol = (
            1.0
            if (
                abs(grid.get_slope(u, v)) > grid.max_slope_deg
                and (u, v) not in grid.leveled_slopes
                and (v, u) not in grid.leveled_slopes
            )
            else 0.0
        )

        c_base[k] = t_cost0 + isp.big_m * (o_u + o_v + s_viol)
        if M_terrain is not None:
            if u in isp.terrain_to_idx:
                M_terrain[k, isp.terrain_to_idx[u]] += c_u1
            if v in isp.terrain_to_idx:
                M_terrain[k, isp.terrain_to_idx[v]] += c_v1

        if M_obs is not None:
            if u in isp.obstacle_to_idx:
                M_obs[k, isp.obstacle_to_idx[u]] += isp.big_m * o_u
            if v in isp.obstacle_to_idx:
                M_obs[k, isp.obstacle_to_idx[v]] += isp.big_m * o_v

        if M_slope is not None and (u, v) in isp.slope_to_idx:
            s_idx = isp.slope_to_idx[(u, v)]
            M_slope[k, s_idx] += isp.big_m * s_viol + t_base0 * slope_pen

        if (
            isp.num_terrain_vars > 0
            and isp.num_slope_vars > 0
            and (u, v) in isp.slope_to_idx
            and slope_pen > 1e-4
        ):
            s_idx = isp.slope_to_idx[(u, v)]
            if u in isp.terrain_to_idx:
                t_idx = isp.terrain_to_idx[u]
                delta_u = (
                    (d_uv / 2.0) * ((1.0 / v_u_eff) - (1.0 / v_target)) * slope_pen
                )
                if abs(delta_u) > 1e-6:
                    cross_items.append((k, t_idx, s_idx, delta_u))
            if v in isp.terrain_to_idx:
                t_idx = isp.terrain_to_idx[v]
                delta_v = (
                    (d_uv / 2.0) * ((1.0 / v_v_eff) - (1.0 / v_target)) * slope_pen
                )
                if abs(delta_v) > 1e-6:
                    cross_items.append((k, t_idx, s_idx, delta_v))

    return w_min, c_base, M_terrain, M_obs, M_slope, cross_items


def build_base_formulation(
    grid: Grid,
    alternative_path: list[tuple[int, int]],
    active_nodes: set[tuple[int, int]] | None = None,
    active_edges: set[tuple[tuple[int, int], tuple[int, int]]] | None = None,
    custom_edge_costs: dict[tuple[tuple[int, int], tuple[int, int]], float]
    | None = None,
) -> MIPFormulation | None:
    isp = ISPSemantics(
        grid=grid,
        candidate_path=alternative_path,
        active_nodes=active_nodes,
        active_edges=active_edges,
        custom_edge_costs=custom_edge_costs,
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

    v_target = grid.speeds[TARGET_TERRAIN]
    v_base_default = grid.speeds[BASE_TERRAIN]

    (
        w_min,
        c_base,
        M_terrain,
        M_obs,
        M_slope,
        cross_items,
    ) = compute_affine_edge_costs(
        grid=grid,
        isp=isp,
        custom_edge_costs=custom_edge_costs,
        v_target=v_target,
        v_base_default=v_base_default,
    )

    w_prime = c_base.copy()
    if z_terrain is not None and M_terrain is not None:
        w_prime = w_prime + M_terrain @ z_terrain
    if z_obstacle is not None and M_obs is not None:
        w_prime = w_prime - M_obs @ z_obstacle
    if z_slope is not None and M_slope is not None:
        w_prime = w_prime - M_slope @ z_slope

    cross_term, extra_constraints = linearize_mccormick_terms(
        cross_items=cross_items,
        num_edges=num_edges,
        z_terrain=z_terrain,
        z_slope=z_slope,
    )
    if cross_term is not None:
        w_prime = w_prime + cross_term

    if z_obstacle is not None:
        extra_constraints.append(z_obstacle == 1.0)
    if z_slope is not None:
        for (u, v), s_idx in isp.slope_to_idx.items():
            if abs(grid.get_slope(u, v)) > grid.max_slope_deg:
                extra_constraints.append(z_slope[s_idx] == 1.0)

    obj_terms = [
        cp.sum(variable)
        for variable in (z_terrain, z_obstacle, z_slope)
        if variable is not None
    ]

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
    )
