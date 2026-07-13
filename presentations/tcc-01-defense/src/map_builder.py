import config
from hill import DEFAULT_STEP, HILL_TYPES, apply_hills
from lake import apply_lake
from obstacle import apply_obstacles


def build_map():
    grid = [
        [_new_flat_cell() for _ in range(config.GRID_SIZE)]
        for _ in range(config.GRID_SIZE)
    ]
    apply_hills(grid, config.HILLS, HILL_TYPES, DEFAULT_STEP)
    apply_lake(grid, config.LAKE_CENTER, config.LAKE_RADIUS)
    apply_obstacles(grid, config.OBSTACLES)
    for position in (config.START, config.GOAL):
        r, c = position
        if not grid[r][c]["traversable"]:
            print(f"Warning: Cell {position} was forced to be flat.")
        grid[r][c]["cost"] = 1
        grid[r][c]["traversable"] = True
        grid[r][c]["terrain_type"] = "flat"

    return grid


def _new_flat_cell():
    return {"terrain_type": "flat", "cost": 1, "traversable": True}
