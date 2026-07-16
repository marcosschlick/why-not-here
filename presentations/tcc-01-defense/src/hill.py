HILL_TYPES = {"high": [5, 4, 3, 2], "medium": [4, 3, 2], "low": [3, 2]}
DEFAULT_STEP = 2


def apply_hills(grid, hills):
    row_count = len(grid)
    column_count = len(grid[0])

    for hill in hills:
        center_row, center_column = hill["center"]
        hill_type = hill["type"]
        base_radius = hill["radius"]
        step = hill.get("step", DEFAULT_STEP)

        costs = HILL_TYPES.get(hill_type)
        if costs is None:
            raise ValueError(f"Hill type '{hill_type}' is not defined in HILL_TYPES.")

        for row in range(row_count):
            for column in range(column_count):
                distance_squared = (row - center_row) ** 2 + (
                    column - center_column
                ) ** 2

                # Each cost forms a concentric band around the hill center.
                for band_index, cost in enumerate(costs):
                    band_radius = base_radius + band_index * step
                    if distance_squared <= band_radius**2:
                        grid[row][column]["cost"] = cost
                        grid[row][column]["traversable"] = True
                        grid[row][column]["terrain_type"] = "flat"
                        break
