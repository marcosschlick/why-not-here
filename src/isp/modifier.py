import copy

from ..config import IMPASSABLE_TERRAINS
from ..grid import Grid
from .types import SemanticModifications


def apply_semantic_modifications(
    grid: Grid,
    modifications: SemanticModifications,
) -> Grid:
    new_grid = Grid(
        h=grid.h,
        w=grid.w,
        cell_size=grid.cell_size,
        connectivity=grid.connectivity,
        max_slope_deg=grid.max_slope_deg,
    )
    new_grid.isp_model = grid.isp_model
    new_grid.speeds = dict(grid.speeds)
    new_grid.robot_speed_theoretical = grid.robot_speed_theoretical
    new_grid.robot_speed_edges = set(grid.robot_speed_edges) | set(
        modifications.robot_speed_edges
    )

    new_grid.load_terrain_matrix(grid.terrain)
    new_grid.load_elevation_matrix(grid.elevation)
    new_grid.load_obstacle_matrix(grid.obstacle)
    new_grid.leveled_slopes = (
        set(grid.leveled_slopes)
        | set(modifications.slope_edges)
        | {(v, u) for u, v in modifications.slope_edges}
    )
    new_grid.terrain_overrides = {
        u
        for u in grid.terrain_overrides
        if grid.get_cell(u).terrain in IMPASSABLE_TERRAINS
    }
    new_grid.base_seed = grid.base_seed
    new_grid.effective_seed = grid.effective_seed
    new_grid.generation_attempt = grid.generation_attempt
    new_grid.generation_profile = copy.deepcopy(grid.generation_profile)

    for u, terrain in modifications.terrain_assignments:
        new_grid.get_cell(u).terrain = terrain

    for u in modifications.obstacle_nodes:
        cell = new_grid.get_cell(u)
        if cell.obstacle != 0:
            cell.obstacle = 0

    for u in modifications.opened_terrain_nodes:
        if new_grid.get_cell(u).terrain in IMPASSABLE_TERRAINS:
            new_grid.terrain_overrides.add(u)

    return new_grid
