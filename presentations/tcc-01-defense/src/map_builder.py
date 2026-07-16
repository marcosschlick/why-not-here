import config
from hill import apply_hills
from lake import apply_lake
from obstacle import apply_obstacles


def build_map():
    grid = [
        [_new_flat_cell() for _ in range(config.GRID_SIZE)]
        for _ in range(config.GRID_SIZE)
    ]
    apply_hills(grid, config.HILLS)
    apply_lake(grid, config.LAKE_CENTER, config.LAKE_RADIUS)
    apply_obstacles(grid, config.OBSTACLES)

    # Keep both endpoints traversable if configured terrain overlaps them.
    for position in (config.START, config.GOAL):
        row, column = position
        if not grid[row][column]["traversable"]:
            print(f"Warning: Cell {position} was forced to be flat.")
        grid[row][column] = _new_flat_cell()

    return grid


def _new_flat_cell():
    return {"terrain_type": "flat", "cost": 1, "traversable": True}
