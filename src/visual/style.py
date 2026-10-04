import numpy as np

from .. import config

OBSTACLE_COLOR = np.array([0.08, 0.08, 0.09])
DEFAULT_TERRAIN_COLOR = np.array([0.5, 0.5, 0.5])


def terrain_color_rgb(terrain_name: str) -> np.ndarray:
    color = config.TERRAIN_COLORS.get(terrain_name)
    if not isinstance(color, str) or len(color) != 7 or not color.startswith("#"):
        return DEFAULT_TERRAIN_COLOR.copy()
    try:
        return np.array(
            [int(color[index : index + 2], 16) / 255.0 for index in (1, 3, 5)],
            dtype=np.float64,
        )
    except ValueError:
        return DEFAULT_TERRAIN_COLOR.copy()

START_COLOR = "#00B0FF"
START_EDGE_COLOR = "#003366"
GOAL_COLOR = "#FFD700"
GOAL_EDGE_COLOR = "#664400"

OPTIMAL_PATH_COLOR = "#00E676"
USER_PATH_COLOR = "#FF1744"

ISP_TERRAIN_COLOR = "#00E5FF"
ISP_OBSTACLE_COLOR = "#FF1744"
ISP_SLOPE_COLOR = "#AA00FF"
ISP_WATER_COLOR = "#FFC107"


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
