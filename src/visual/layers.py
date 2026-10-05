import math

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Circle, Polygon

from .. import config
from ..grid import Grid
from ..isp import SemanticModifications
from .style import (
    GOAL_COLOR,
    GOAL_EDGE_COLOR,
    MODIFICATION_EDGE_COLOR,
    MODIFICATION_OBSTACLE_COLOR,
    MODIFICATION_SLOPE_COLOR,
    MODIFICATION_TERRAIN_COLOR,
    MODIFICATION_WATER_COLOR,
    OBSTACLE_COLOR,
    START_COLOR,
    START_EDGE_COLOR,
    terrain_color_rgb,
)

_ModificationPoint = tuple[float, float]
_ModificationGroup = tuple[list[_ModificationPoint], list[_ModificationPoint]]


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
                elevation_ratio = (cell.elevation - min_elev) / elev_range
                factor = (
                    config.MAP_ELEVATION_SHADE_MIN
                    + (config.MAP_ELEVATION_SHADE_MAX - config.MAP_ELEVATION_SHADE_MIN)
                    * elevation_ratio
                )
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


def draw_modifications(
    ax: plt.Axes,
    modifications: SemanticModifications,
    edge_width: float,
) -> None:
    origin_x = ax.transData.transform((0, 0))[0]
    next_x = ax.transData.transform((1, 0))[0]
    cell_width_points = abs(next_x - origin_x) * 72 / ax.figure.dpi
    slope_points = [
        ((u[0] + v[0]) / 2, (u[1] + v[1]) / 2)
        for u, v in modifications.slope_edges
    ]
    _draw_modification_points(
        ax,
        slope_points,
        MODIFICATION_SLOPE_COLOR,
        edge_width,
        cell_width_points,
    )
    _draw_modification_cells(
        ax,
        modifications.terrain_nodes,
        MODIFICATION_TERRAIN_COLOR,
        edge_width,
        cell_width_points,
    )
    _draw_modification_cells(
        ax,
        modifications.obstacle_nodes,
        MODIFICATION_OBSTACLE_COLOR,
        edge_width,
        cell_width_points,
    )
    _draw_modification_cells(
        ax,
        modifications.water_nodes,
        MODIFICATION_WATER_COLOR,
        edge_width,
        cell_width_points,
    )


def _draw_modification_cells(
    ax: plt.Axes,
    nodes: list[tuple[int, int]],
    color: str,
    edge_width: float,
    cell_width_points: float,
) -> None:
    _draw_modification_points(
        ax,
        [(float(row), float(col)) for row, col in nodes],
        color,
        edge_width,
        cell_width_points,
    )


def _group_modification_points(points: list[_ModificationPoint]) -> list[_ModificationGroup]:
    neighbors: list[list[int]] = [[] for _ in points]
    buckets: dict[tuple[int, int], list[int]] = {}

    for index, (row, col) in enumerate(points):
        bucket_row = math.floor(row)
        bucket_col = math.floor(col)
        for nearby_row in range(bucket_row - 1, bucket_row + 2):
            for nearby_col in range(bucket_col - 1, bucket_col + 2):
                for candidate_index in buckets.get((nearby_row, nearby_col), []):
                    candidate_row, candidate_col = points[candidate_index]
                    if (
                        abs(row - candidate_row) <= 1
                        and abs(col - candidate_col) <= 1
                    ):
                        neighbors[index].append(candidate_index)
                        neighbors[candidate_index].append(index)

        buckets.setdefault((bucket_row, bucket_col), []).append(index)

    visited: set[int] = set()
    groups: list[_ModificationGroup] = []

    def ordered_neighbors(current_index: int) -> list[int]:
        current_row, current_col = points[current_index]

        def neighbor_key(index: int) -> tuple[int, float, float, float, int]:
            row, col = points[index]
            row_distance = abs(current_row - row)
            col_distance = abs(current_col - col)
            changed_axes = int(row_distance > 0) + int(col_distance > 0)
            distance = row_distance**2 + col_distance**2
            return changed_axes, distance, row, col, index

        return sorted(neighbors[current_index], key=neighbor_key)

    for start in range(len(points)):
        if start in visited:
            continue

        group_points = [points[start]]
        path = [points[start]]
        visited.add(start)
        traversal = [(start, ordered_neighbors(start), 0)]

        while traversal:
            current_index, candidates, next_neighbor = traversal[-1]
            if next_neighbor >= len(candidates):
                traversal.pop()
                if traversal:
                    path.append(points[traversal[-1][0]])
                continue

            neighbor_index = candidates[next_neighbor]
            traversal[-1] = (current_index, candidates, next_neighbor + 1)
            if neighbor_index in visited:
                continue

            visited.add(neighbor_index)
            group_points.append(points[neighbor_index])
            path.append(points[neighbor_index])
            traversal.append((neighbor_index, ordered_neighbors(neighbor_index), 0))

        groups.append((group_points, path))

    return groups


def _draw_modification_points(
    ax: plt.Axes,
    points: list[_ModificationPoint],
    color: str,
    edge_width: float,
    cell_width_points: float,
) -> None:
    for group_points, path in _group_modification_points(points):
        if len(group_points) == 1:
            row, col = group_points[0]
            _draw_modification_circle(ax, (col, row), color, edge_width)
            continue

        _draw_modification_group(
            ax,
            path,
            color,
            edge_width,
            cell_width_points,
        )


def _draw_modification_group(
    ax: plt.Axes,
    path: list[_ModificationPoint],
    color: str,
    edge_width: float,
    cell_width_points: float,
) -> None:
    marker_width_points = cell_width_points * 0.78
    columns = [col for row, col in path]
    rows = [row for row, col in path]

    def draw_group_path(line_color: str, line_width: float) -> None:
        ax.plot(
            columns,
            rows,
            color=line_color,
            linewidth=line_width,
            solid_capstyle="round",
            solid_joinstyle="round",
            zorder=6,
        )

    draw_group_path(MODIFICATION_EDGE_COLOR, marker_width_points + edge_width)
    draw_group_path(color, marker_width_points)


def _draw_modification_circle(
    ax: plt.Axes,
    center: tuple[float, float],
    color: str,
    edge_width: float,
) -> None:
    ax.add_patch(
        Circle(
            center,
            radius=0.39,
            facecolor=color,
            edgecolor=MODIFICATION_EDGE_COLOR,
            linewidth=edge_width,
            zorder=6,
        )
    )


def _path_with_shared_offset(
    path: list[tuple[int, int]],
    shared_cells: set[tuple[int, int]],
    offset_side: float,
) -> list[tuple[float, float]]:
    points = [(float(col), float(row)) for row, col in path]
    for index, (row, col) in enumerate(path):
        if (row, col) not in shared_cells:
            continue

        previous = path[index - 1] if index > 0 else path[index]
        following = path[index + 1] if index + 1 < len(path) else path[index]
        tangent_x = following[1] - previous[1]
        tangent_y = following[0] - previous[0]
        if math.hypot(tangent_x, tangent_y) == 0.0:
            tangent_x = following[1] - col or col - previous[1]
            tangent_y = following[0] - row or row - previous[0]

        tangent_length = math.hypot(tangent_x, tangent_y)
        if tangent_length == 0.0:
            continue
        if tangent_x < 0 or (tangent_x == 0 and tangent_y < 0):
            tangent_x *= -1
            tangent_y *= -1

        before_is_shared = index > 0 and path[index - 1] in shared_cells
        after_is_shared = index + 1 < len(path) and path[index + 1] in shared_cells
        transition = 1.0 if before_is_shared and after_is_shared else 0.5
        offset = 0.12 * offset_side * transition / tangent_length
        points[index] = (
            col - tangent_y * offset,
            row + tangent_x * offset,
        )
    return points


def _rounded_path_points(
    points: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    if len(points) < 3:
        return points

    rounded_points = [points[0]]
    for index in range(1, len(points) - 1):
        previous = points[index - 1]
        current = points[index]
        following = points[index + 1]
        incoming_x = current[0] - previous[0]
        incoming_y = current[1] - previous[1]
        outgoing_x = following[0] - current[0]
        outgoing_y = following[1] - current[1]
        incoming_length = math.hypot(incoming_x, incoming_y)
        outgoing_length = math.hypot(outgoing_x, outgoing_y)
        cross = incoming_x * outgoing_y - incoming_y * outgoing_x

        if abs(cross) < 1e-9:
            rounded_points.append(current)
            continue

        if incoming_length == 0.0 or outgoing_length == 0.0:
            rounded_points.append(current)
            continue

        radius = min(0.28, incoming_length * 0.4, outgoing_length * 0.4)
        incoming_unit_x = incoming_x / incoming_length
        incoming_unit_y = incoming_y / incoming_length
        outgoing_unit_x = outgoing_x / outgoing_length
        outgoing_unit_y = outgoing_y / outgoing_length
        entry = (
            current[0] - incoming_unit_x * radius,
            current[1] - incoming_unit_y * radius,
        )
        exit_point = (
            current[0] + outgoing_unit_x * radius,
            current[1] + outgoing_unit_y * radius,
        )
        rounded_points.append(entry)

        for sample in range(1, 9):
            t = sample / 8
            inverse_t = 1 - t
            rounded_points.append(
                (
                    inverse_t**2 * entry[0]
                    + 2 * inverse_t * t * current[0]
                    + t**2 * exit_point[0],
                    inverse_t**2 * entry[1]
                    + 2 * inverse_t * t * current[1]
                    + t**2 * exit_point[1],
                )
            )

    rounded_points.append(points[-1])
    return rounded_points


def draw_path(
    ax: plt.Axes,
    path: list[tuple[int, int]],
    color: str,
    linewidth: float,
    zorder: int = 5,
    shared_cells: set[tuple[int, int]] | None = None,
    offset_side: float = 0.0,
) -> None:
    if not path:
        return
    visual_points = _path_with_shared_offset(path, shared_cells or set(), offset_side)
    rounded_points = _rounded_path_points(visual_points)
    kwargs = {
        "color": color,
        "linewidth": linewidth,
        "zorder": zorder,
        "solid_capstyle": "round",
        "solid_joinstyle": "round",
    }
    ax.plot(
        [point[0] for point in rounded_points],
        [point[1] for point in rounded_points],
        **kwargs,
    )


def draw_endpoints(
    ax: plt.Axes,
    start: tuple[int, int],
    goal: tuple[int, int],
    radius: float,
    edge_width: float,
) -> None:
    ax.add_patch(
        Polygon(
            (
                (start[1], start[0] - radius),
                (start[1] + radius, start[0]),
                (start[1], start[0] + radius),
                (start[1] - radius, start[0]),
            ),
            closed=True,
            facecolor=START_COLOR,
            edgecolor=START_EDGE_COLOR,
            linewidth=edge_width,
            zorder=7,
        )
    )
    ax.add_patch(
        Polygon(
            (
                (goal[1], goal[0] - radius),
                (goal[1] + radius, goal[0]),
                (goal[1], goal[0] + radius),
                (goal[1] - radius, goal[0]),
            ),
            closed=True,
            facecolor=GOAL_COLOR,
            edgecolor=GOAL_EDGE_COLOR,
            linewidth=edge_width,
            zorder=7,
        )
    )
