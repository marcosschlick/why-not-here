from itertools import pairwise

import cvxpy as cp
import numpy as np
from scipy.sparse import lil_matrix

from ..grid import Grid
from .budget import check_deadline
from .semantics import ISPSemantics, terrain_change_weight
from .types import MIPFormulation


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
        grid,
        alternative_path,
        active_nodes,
        active_edges,
        custom_edge_costs,
        terrain_decision_nodes,
    )
    count = len(isp.edges)
    x_alt = np.zeros(count)
    for u, v in pairwise(alternative_path):
        if (u, v) not in isp.edge_to_idx:
            return None
        x_alt[isp.edge_to_idx[(u, v)]] += 1
    sizes = {
        "terrain": isp.num_terrain_vars,
        "cell_opening": len(isp.cell_openings),
        "slope": len(isp.slope_adjustments),
        "environmental_speed": len(isp.environmental_speed_edges),
        "robot_capability": len(isp.robot_capability_edges),
    }
    variables = {
        name: cp.Variable(size, boolean=True) if size else None
        for name, size in sizes.items()
    }
    baseline = np.zeros(count)
    minimum = np.zeros(count)
    terrain_matrix = lil_matrix((count, sizes["terrain"])) if sizes["terrain"] else None
    maximum_speed = (
        max(grid.speeds.values())
        if grid.isp_model == "BRANDAO"
        else grid.robot_speed_theoretical
    )
    for index, (u, v) in enumerate(isp.edges):
        if index % 256 == 0:
            check_deadline()
        distance = grid.get_distance(u, v)
        minimum[index] = distance / maximum_speed
        if (u, v) in isp.custom_edge_costs:
            baseline[index] = isp.custom_edge_costs[(u, v)]
            continue
        baseline[index] = grid.get_cost(u, v, isp.opened_cells, isp.corrected_edges)
        if not np.isfinite(baseline[index]):
            raise ValueError(
                "A modeled physical edge remains impassable after mandatory corrections."
            )
        if terrain_matrix is not None:
            for node in (u, v):
                if node not in isp.terrain_to_idx:
                    continue
                first = isp.terrain_to_idx[node] * len(isp.terrain_classes)
                speed = grid._get_effective_speed(node)
                for label, terrain in enumerate(isp.terrain_classes):
                    terrain_matrix[index, first + label] += (
                        distance * 0.5 * (1 / grid.speeds[terrain] - 1 / speed)
                    )
    w_prime = cp.Constant(baseline)
    if terrain_matrix is not None:
        w_prime = w_prime + terrain_matrix.tocsr() @ variables["terrain"]
    for name, records in (
        ("environmental_speed", isp.environmental_speed_edges),
        ("robot_capability", isp.robot_capability_edges),
    ):
        if not records:
            continue
        matrix = lil_matrix((count, len(records)))
        for index, record in enumerate(records):
            position = isp.edge_to_idx[record.edge]
            matrix[position, index] = (
                grid.get_distance(*record.edge) / record.target_speed_mps
                - baseline[position]
            )
        w_prime = w_prime + matrix.tocsr() @ variables[name]
    constraints = [
        variables[name] == 1
        for name in ("cell_opening", "slope")
        if variables[name] is not None
    ]
    objective = [
        cp.sum(variable)
        for name, variable in variables.items()
        if name != "terrain" and variable is not None
    ]
    if variables["terrain"] is not None:
        class_count = len(isp.terrain_classes)
        changed_cells = cp.Variable(len(isp.terrain_nodes), nonneg=True)
        for index, node in enumerate(isp.terrain_nodes):
            constraints.append(
                cp.sum(
                    variables["terrain"][
                        index * class_count : (index + 1) * class_count
                    ]
                )
                == 1
            )
            original_label = (
                index * class_count
                + isp.terrain_class_to_idx[grid.get_cell(node).terrain]
            )
            constraints.append(
                changed_cells[index] + variables["terrain"][original_label] == 1
            )
        interior = set(alternative_path[1:-1])
        weights = [
            terrain_change_weight(grid, node, interior) for node in isp.terrain_nodes
        ]
        objective.append(cp.sum(cp.multiply(weights, changed_cells)))
    return MIPFormulation(
        isp,
        x_alt,
        w_prime,
        minimum,
        constraints,
        objective,
        **{f"z_{name}": variable for name, variable in variables.items()},
    )
