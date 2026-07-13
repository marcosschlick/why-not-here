HILL_TYPES = {"high": [5, 4, 3, 2], "medium": [4, 3, 2], "low": [3, 2]}
DEFAULT_STEP = 2


def apply_hills(grid, hills, hill_types=None, default_step=None):
    if hill_types is None:
        hill_types = HILL_TYPES
    if default_step is None:
        default_step = DEFAULT_STEP

    rows = len(grid)
    columns = len(grid[0])

    for hill in hills:
        center = hill["center"]
        hill_type = hill["type"]
        radius = hill["radius"]
        step = hill.get("step", default_step)

        costs = hill_types.get(hill_type)
        if costs is None:
            raise ValueError(f"Hill type '{hill_type}' is not defined in HILL_TYPES.")

        for r in range(rows):
            for c in range(columns):
                dist2 = (r - center[0]) ** 2 + (c - center[1]) ** 2
                for i, cost in enumerate(costs):
                    current_radius = radius + i * step
                    if dist2 <= current_radius**2:
                        grid[r][c]["cost"] = cost
                        grid[r][c]["traversable"] = True
                        grid[r][c]["terrain_type"] = "flat"
                        break
