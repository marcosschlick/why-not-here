from copy import deepcopy

from ..grid import Grid
from .types import SemanticModifications


def apply_semantic_modifications(
    grid: Grid,
    modifications: SemanticModifications,
) -> Grid:
    if modifications.model != grid.isp_model:
        raise ValueError("Intervention model does not match the grid.")
    new_grid = deepcopy(grid)
    if sorted(modifications.terrain_nodes) != sorted(
        node for node, _ in modifications.terrain_assignments
    ):
        raise ValueError("Terrain change coordinates do not match the assignments.")
    for node, terrain in modifications.terrain_assignments:
        if terrain not in new_grid.speeds or new_grid.speeds[terrain] <= 0:
            raise ValueError("Invalid Brandao terrain assignment.")
        new_grid.get_cell(node).terrain = terrain
    for opening in modifications.cell_openings:
        cell = new_grid.get_cell(opening.cell)
        if (
            cell.obstacle != opening.original_obstacle
            or cell.terrain != opening.original_terrain
        ):
            raise ValueError(
                "Cell opening does not match its original blocking causes."
            )
        cell.obstacle = 0
    for name, key_name in (
        ("cell_openings", "cell"),
        ("slope_adjustments", "edge"),
        ("environmental_speed_edges", "edge"),
        ("robot_capability_edges", "edge"),
    ):
        collection = getattr(new_grid, name)
        for record in getattr(modifications, name):
            key = getattr(record, key_name)
            if key in collection:
                raise ValueError(f"Duplicate {name} intervention.")
            collection[key] = record
    new_grid.validate_interventions()
    return new_grid
