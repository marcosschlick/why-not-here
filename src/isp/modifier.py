from ..config import BASE_TERRAIN, IMPASSABLE_TERRAINS, TARGET_TERRAIN
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

    for u in modifications.terrain_nodes:
        new_grid.get_cell(u).terrain = TARGET_TERRAIN

    for u in modifications.obstacle_nodes:
        cell = new_grid.get_cell(u)
        cell.obstacle = 0
        if cell.terrain in IMPASSABLE_TERRAINS:
            cell.terrain = BASE_TERRAIN

    return new_grid
