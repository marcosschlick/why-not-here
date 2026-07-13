def apply_obstacles(grid, obstacles):
    for r, c in obstacles:
        if 0 <= r < len(grid) and 0 <= c < len(grid[0]):
            grid[r][c]["cost"] = 0
            grid[r][c]["traversable"] = False
            grid[r][c]["terrain_type"] = "obstacle"
