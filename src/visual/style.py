import numpy as np

BASE_TERRAIN_COLORS: dict[str, np.ndarray] = {
    "COMPACTED_SOIL": np.array([0.62, 0.42, 0.28]),
    "GRASS": np.array([0.18, 0.58, 0.22]),
    "DRY_VEGETATION": np.array([0.75, 0.76, 0.20]),
    "SAND": np.array([0.98, 0.82, 0.26]),
    "MUD": np.array([0.36, 0.22, 0.16]),
    "WATER_RIVER": np.array([0.02, 0.52, 0.90]),
}

OBSTACLE_COLOR = np.array([0.08, 0.08, 0.09])
DEFAULT_TERRAIN_COLOR = np.array([0.5, 0.5, 0.5])

START_COLOR = "#00B0FF"
START_EDGE_COLOR = "#003366"
GOAL_COLOR = "#FFD700"
GOAL_EDGE_COLOR = "#664400"

OPTIMAL_PATH_COLOR = "#00E676"
USER_PATH_COLOR = "#FF1744"

STEEP_SLOPE_FACE_COLOR = "#FF5252"
STEEP_SLOPE_EDGE_COLOR = "#D32F2F"

ISP_TERRAIN_COLOR = "#00E5FF"
ISP_OBSTACLE_COLOR = "#FF1744"
ISP_SLOPE_COLOR = "#AA00FF"


def compute_layout(h: int, w: int) -> dict:
    max_dim = max(h, w)
    if max_dim <= 16:
        return {
            "tick_step": 2,
            "grid_alpha": 0.9,
            "grid_lw": 0.9,
            "show_grid": True,
            "path_lw": 3.0,
            "marker_size": 5.0,
            "endpoint_s": 140.0,
        }
    if max_dim <= 32:
        return {
            "tick_step": 4,
            "grid_alpha": 0.8,
            "grid_lw": 0.7,
            "show_grid": True,
            "path_lw": 2.4,
            "marker_size": 3.5,
            "endpoint_s": 110.0,
        }
    if max_dim <= 64:
        return {
            "tick_step": 8,
            "grid_alpha": 0.35,
            "grid_lw": 0.5,
            "show_grid": True,
            "path_lw": 2.0,
            "marker_size": 2.0,
            "endpoint_s": 80.0,
        }
    if max_dim <= 128:
        return {
            "tick_step": 16,
            "grid_alpha": 0.0,
            "grid_lw": 0.0,
            "show_grid": False,
            "path_lw": 1.6,
            "marker_size": 0.0,
            "endpoint_s": 55.0,
        }
    return {
        "tick_step": 32,
        "grid_alpha": 0.0,
        "grid_lw": 0.0,
        "show_grid": False,
        "path_lw": 1.2,
        "marker_size": 0.0,
        "endpoint_s": 40.0,
    }
