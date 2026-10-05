import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from matplotlib import patheffects
from matplotlib.legend_handler import HandlerBase
from matplotlib.lines import Line2D

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
    OPTIMAL_PATH_COLOR,
    ROUTE_WIDTH,
    START_COLOR,
    START_EDGE_COLOR,
    USER_PATH_COLOR,
    USER_PATH_OUTLINE_COLOR,
    USER_PATH_OUTLINE_WIDTH,
    terrain_color_rgb,
)


class SharedRouteHandle(Line2D):
    def __init__(self) -> None:
        super().__init__([], [], label="Shared section")


class SharedRouteHandler(HandlerBase):
    def create_artists(
        self,
        legend,
        original_handle,
        xdescent,
        ydescent,
        width,
        height,
        fontsize,
        transform,
    ):
        line_start = xdescent
        line_end = xdescent + width
        optimal_y = ydescent + height * 0.68
        alternative_y = ydescent + height * 0.35
        return [
            Line2D(
                [line_start, line_end],
                [optimal_y, optimal_y],
                color=OPTIMAL_PATH_COLOR,
                linewidth=2,
                solid_capstyle="round",
                transform=transform,
            ),
            _outlined_alternative_line(
                Line2D(
                    [line_start, line_end],
                    [alternative_y, alternative_y],
                    color=USER_PATH_COLOR,
                    linewidth=2,
                    solid_capstyle="round",
                    transform=transform,
                )
            ),
        ]


def _outlined_alternative_line(line: Line2D) -> Line2D:
    line.set_path_effects(
        [
            patheffects.Stroke(
                linewidth=2 * USER_PATH_OUTLINE_WIDTH / ROUTE_WIDTH,
                foreground=USER_PATH_OUTLINE_COLOR,
            ),
            patheffects.Normal(),
        ]
    )
    return line


class ModificationDotHandle(Line2D):
    def __init__(self, color: str, label: str) -> None:
        super().__init__([], [], marker="o", markerfacecolor=color, label=label)


class ModificationDotHandler(HandlerBase):
    def create_artists(
        self,
        legend,
        original_handle,
        xdescent,
        ydescent,
        width,
        height,
        fontsize,
        transform,
    ):
        center = (xdescent + width / 2, ydescent + height / 2)
        return [
            mpatches.Circle(
                center,
                radius=min(width, height) * 0.39,
                facecolor=original_handle.get_markerfacecolor(),
                edgecolor=MODIFICATION_EDGE_COLOR,
                linewidth=0.65,
                transform=transform,
            ),
        ]


def build_tactical_legend(
    ax: plt.Axes,
    grid: Grid,
    modifications: SemanticModifications | None,
    show_optimal_path: bool,
    show_alternative_path: bool,
    show_endpoints: bool,
) -> None:
    handles = []
    section_labels = set()

    def add_section(label: str) -> None:
        handles.append(
            mpatches.Patch(
                facecolor="none",
                edgecolor="none",
                label=label,
            )
        )
        section_labels.add(label)

    if show_optimal_path or show_alternative_path:
        add_section("Routes")
        if show_optimal_path:
            handles.append(
                Line2D(
                    [],
                    [],
                    color=OPTIMAL_PATH_COLOR,
                    linewidth=2,
                    solid_capstyle="round",
                    label="p* · Optimal",
                )
            )
        if show_alternative_path:
            handles.append(
                _outlined_alternative_line(
                    Line2D(
                        [],
                        [],
                        color=USER_PATH_COLOR,
                        linewidth=2,
                        solid_capstyle="round",
                        label="p′ · Alternative",
                    )
                )
            )
        if show_optimal_path and show_alternative_path:
            handles.append(SharedRouteHandle())

    if show_endpoints:
        add_section("Endpoints")
        handles.extend(
            (
                Line2D(
                    [],
                    [],
                    linestyle="none",
                    marker="D",
                    markersize=7,
                    markerfacecolor=START_COLOR,
                    markeredgecolor=START_EDGE_COLOR,
                    label="Start",
                ),
                Line2D(
                    [],
                    [],
                    linestyle="none",
                    marker="D",
                    markersize=7,
                    markerfacecolor=GOAL_COLOR,
                    markeredgecolor=GOAL_EDGE_COLOR,
                    label="Goal",
                ),
            )
        )

    add_section("Terrain")
    handles.extend(
        mpatches.Patch(
            color=terrain_color_rgb(name),
            label=f"{name.lower().replace('_', ' ')} ({speed:g} m/s)",
        )
        for name, speed in grid.speeds.items()
    )
    handles.append(mpatches.Patch(color=OBSTACLE_COLOR, label="Obstacle"))

    if modifications is not None:
        changes = (
            (
                len(modifications.terrain_nodes),
                MODIFICATION_TERRAIN_COLOR,
                "Terrain changed",
            ),
            (
                len(modifications.obstacle_nodes),
                MODIFICATION_OBSTACLE_COLOR,
                "Obstacle cleared",
            ),
            (
                len(modifications.slope_edges),
                MODIFICATION_SLOPE_COLOR,
                "Slope leveled",
            ),
            (
                len(modifications.water_nodes),
                MODIFICATION_WATER_COLOR,
                "Water opened",
            ),
        )
        if any(count > 0 for count, _, _ in changes):
            add_section("Changes")
            for count, color, label in changes:
                if count == 0:
                    continue
                handles.append(
                    ModificationDotHandle(color, f"{label} ({count})")
                )

    legend = ax.legend(
        handles=handles,
        loc="upper left",
        bbox_to_anchor=(1.02, 1.0),
        borderaxespad=0,
        fontsize=8.5,
        handlelength=1.5,
        labelspacing=0.5,
        framealpha=0.92,
        handler_map={
            SharedRouteHandle: SharedRouteHandler(),
            ModificationDotHandle: ModificationDotHandler(),
        },
    )
    for label in legend.get_texts():
        if label.get_text() in section_labels:
            label.set_fontweight("bold")
            label.set_color("#282828")
