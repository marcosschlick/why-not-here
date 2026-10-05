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

OPTIMAL_PATH_COLOR = "#327DE1"
USER_PATH_COLOR = "#F8F8F8"
USER_PATH_OUTLINE_COLOR = "#282828"
ROUTE_WIDTH = 0.14
USER_PATH_OUTLINE_WIDTH = 0.20

MODIFICATION_TERRAIN_COLOR = "#CC79A7"
MODIFICATION_OBSTACLE_COLOR = "#E69F00"
MODIFICATION_SLOPE_COLOR = "#009E73"
MODIFICATION_WATER_COLOR = "#56B4E9"
MODIFICATION_EDGE_COLOR = "#282828"


def compute_layout(h: int, w: int) -> dict:
    max_dim = max(h, w)
    if max_dim <= 16:
        return {
            "tick_step": 2,
            "grid_alpha": 0.9,
            "grid_lw": 0.9,
            "show_grid": True,
        }
    if max_dim <= 32:
        return {
            "tick_step": 4,
            "grid_alpha": 0.8,
            "grid_lw": 0.7,
            "show_grid": True,
        }
    if max_dim <= 64:
        return {
            "tick_step": 8,
            "grid_alpha": 0.35,
            "grid_lw": 0.5,
            "show_grid": True,
        }
    if max_dim <= 128:
        return {
            "tick_step": 16,
            "grid_alpha": 0.0,
            "grid_lw": 0.0,
            "show_grid": False,
        }
    return {
        "tick_step": 32,
        "grid_alpha": 0.0,
        "grid_lw": 0.0,
        "show_grid": False,
    }


def axis_ticks(size: int, step: int) -> list[int]:
    ticks = list(range(0, size, step))
    last_index = size - 1
    if ticks[-1] != last_index:
        ticks.append(last_index)
    return ticks
