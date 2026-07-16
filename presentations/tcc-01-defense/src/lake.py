def apply_lake(grid, center, radius):
    if center is None:
        return

    row_count = len(grid)
    column_count = len(grid[0])
    center_row, center_column = center

    for row in range(row_count):
        for column in range(column_count):
            distance_squared = (row - center_row) ** 2 + (
                column - center_column
            ) ** 2
            if distance_squared <= radius**2:
                cell = grid[row][column]
                cell["cost"] = 0
                cell["traversable"] = False
                cell["terrain_type"] = "lake"
