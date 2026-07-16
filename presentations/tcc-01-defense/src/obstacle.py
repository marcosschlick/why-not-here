def apply_obstacles(grid, obstacles):
    row_count = len(grid)
    column_count = len(grid[0])

    for row, column in obstacles:
        if 0 <= row < row_count and 0 <= column < column_count:
            cell = grid[row][column]
            cell["cost"] = 0
            cell["traversable"] = False
            cell["terrain_type"] = "obstacle"
