from ..config import TARGET_TERRAIN, WATER_TERRAIN
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
    new_grid.speeds = dict(grid.speeds)

    new_grid.load_terrain_matrix(grid.terrain)
    new_grid.load_elevation_matrix(grid.elevation)
    new_grid.load_obstacle_matrix(grid.obstacle)
    new_grid.leveled_slopes = (
        set(grid.leveled_slopes)
        | set(modifications.slope_edges)
        | {(v, u) for u, v in modifications.slope_edges}
    )
    new_grid.water_overrides = {
        u for u in grid.water_overrides if grid.get_cell(u).terrain == WATER_TERRAIN
    }
    new_grid.base_seed = grid.base_seed
    new_grid.effective_seed = grid.effective_seed
    new_grid.generation_attempt = grid.generation_attempt

    for u in modifications.terrain_nodes:
        if new_grid.get_cell(u).terrain != WATER_TERRAIN:
            new_grid.get_cell(u).terrain = TARGET_TERRAIN

    for u in modifications.obstacle_nodes:
        cell = new_grid.get_cell(u)
        if cell.obstacle != 0:
            cell.obstacle = 0

    for u in modifications.water_nodes:
        if new_grid.get_cell(u).terrain == WATER_TERRAIN:
            new_grid.water_overrides.add(u)

    return new_grid
