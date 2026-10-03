import matplotlib.pyplot as plt
import numpy as np

from ..grid import Grid
from ..isp import SemanticModifications
from .style import (
    GOAL_COLOR,
    GOAL_EDGE_COLOR,
    ISP_OBSTACLE_COLOR,
    ISP_SLOPE_COLOR,
    ISP_TERRAIN_COLOR,
    OBSTACLE_COLOR,
    START_COLOR,
    START_EDGE_COLOR,
    STEEP_SLOPE_EDGE_COLOR,
    STEEP_SLOPE_FACE_COLOR,
    terrain_color_rgb,
)


def create_grid_rgb_matrix(grid: Grid) -> np.ndarray:
    elev_matrix = np.array(grid.elevation, dtype=np.float64)
    min_elev = float(np.min(elev_matrix))
    max_elev = float(np.max(elev_matrix))
    elev_range = max_elev - min_elev

    rgb = np.zeros((grid.h, grid.w, 3), dtype=np.float64)
    for i in range(grid.h):
        for j in range(grid.w):
            cell = grid.cells[i][j]
            if cell.terrain == "WATER_RIVER":
                base = terrain_color_rgb(cell.terrain)
            elif cell.obstacle != 0:
                base = OBSTACLE_COLOR
            else:
                base = terrain_color_rgb(cell.terrain)

            if elev_range > 0.0:
                factor = 0.82 + 0.36 * ((cell.elevation - min_elev) / elev_range)
            else:
                factor = 1.0
            rgb[i, j] = np.clip(base * factor, 0.0, 1.0)
    return rgb


def find_steep_cells(grid: Grid) -> set[tuple[int, int]]:
    steep_cells: set[tuple[int, int]] = set()
    for i in range(grid.h):
        for j in range(grid.w):
            u = (i, j)
            if grid.cells[i][j].is_blocked:
                continue
            for v in grid.get_neighbors(u, only_traversable=False):
                if grid.get_cell(v).is_blocked:
                    continue
                if abs(grid.get_slope(u, v)) > grid.max_slope_deg:
                    steep_cells.add(u)
                    steep_cells.add(v)
    return steep_cells


def draw_steep_slopes(ax: plt.Axes, steep_cells: set[tuple[int, int]]) -> None:
    for u in steep_cells:
        rect = plt.Rectangle(
            (u[1] - 0.5, u[0] - 0.5),
            1.0,
            1.0,
            facecolor=STEEP_SLOPE_FACE_COLOR,
            alpha=0.30,
            edgecolor=STEEP_SLOPE_EDGE_COLOR,
            linewidth=0.8,
            hatch="//",
            zorder=3,
        )
        ax.add_patch(rect)


def draw_modifications(
    ax: plt.Axes,
    modifications: SemanticModifications,
    path_lw: float,
) -> None:
    node_lw = max(2.2, path_lw + 0.5)

    for u in modifications.terrain_nodes:
        rect = plt.Rectangle(
            (u[1] - 0.48, u[0] - 0.48),
            0.96,
            0.96,
            fill=True,
            facecolor=ISP_TERRAIN_COLOR,
            alpha=0.35,
            edgecolor=ISP_TERRAIN_COLOR,
            linewidth=node_lw,
            linestyle="-",
            zorder=6,
        )
        ax.add_patch(rect)

    for u in modifications.obstacle_nodes:
        rect = plt.Rectangle(
            (u[1] - 0.48, u[0] - 0.48),
            0.96,
            0.96,
            fill=True,
            facecolor=ISP_OBSTACLE_COLOR,
            alpha=0.35,
            edgecolor=ISP_OBSTACLE_COLOR,
            linewidth=node_lw,
            hatch="xx",
            linestyle="-",
            zorder=6,
        )
        ax.add_patch(rect)

    slope_lw = max(2.5, path_lw + 1.0)
    for u, v in modifications.slope_edges:
        ax.plot(
            [u[1], v[1]],
            [u[0], v[0]],
            color=ISP_SLOPE_COLOR,
            linewidth=slope_lw,
            linestyle="-",
            zorder=6,
        )


def draw_path(
    ax: plt.Axes,
    path: list[tuple[int, int]],
    color: str,
    label: str,
    linestyle: str = "-",
    linewidth: float = 2.5,
    marker_size: float = 3.5,
    zorder: int = 5,
) -> None:
    if not path:
        return
    rows = [u[0] for u in path]
    cols = [u[1] for u in path]
    kwargs = {
        "color": color,
        "linewidth": linewidth,
        "linestyle": linestyle,
        "label": label,
        "zorder": zorder,
    }
    if marker_size > 0.0:
        kwargs["marker"] = "o"
        kwargs["markersize"] = marker_size
    ax.plot(cols, rows, **kwargs)


def draw_endpoints(
    ax: plt.Axes,
    start: tuple[int, int],
    goal: tuple[int, int],
    size: float = 110.0,
) -> None:
    ax.scatter(
        start[1],
        start[0],
        color=START_COLOR,
        s=size,
        edgecolors=START_EDGE_COLOR,
        linewidths=1.5,
        zorder=7,
        label="Start (s)",
    )
    ax.scatter(
        goal[1],
        goal[0],
        color=GOAL_COLOR,
        s=size,
        edgecolors=GOAL_EDGE_COLOR,
        linewidths=1.5,
        zorder=7,
        label="Goal (t)",
    )
