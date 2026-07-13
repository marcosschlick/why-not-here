def apply_lake(grid, center, radius):
    if center is None:
        return

    rows = len(grid)
    columns = len(grid[0])
    cy, cx = center

    for r in range(rows):
        for c in range(columns):
            if (r - cy) ** 2 + (c - cx) ** 2 <= radius**2:
                grid[r][c]["cost"] = 0
                grid[r][c]["traversable"] = False
                grid[r][c]["terrain_type"] = "lake"
