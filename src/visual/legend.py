import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from matplotlib import patheffects
from matplotlib.legend_handler import HandlerBase
from matplotlib.lines import Line2D

from ..grid import Grid
from ..isp import SemanticModifications
from .style import (
    BRANDAO_BLOCKED_COLOR,
    GOAL_COLOR,
    GOAL_EDGE_COLOR,
    MODIFICATION_CELL_OPENING_COLOR,
    MODIFICATION_EDGE_COLOR,
    MODIFICATION_ENVIRONMENTAL_SPEED_COLOR,
    MODIFICATION_ROBOT_CAPABILITY_COLOR,
    MODIFICATION_SLOPE_COLOR,
    MODIFICATION_TERRAIN_COLOR,
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


class TerrainSlowHandle(ModificationDotHandle):
    pass


class TerrainSlowHandler(HandlerBase):
    def create_artists(self, legend, original_handle, xdescent, ydescent, width, height, fontsize, transform):
        center = (xdescent + width / 2, ydescent + height / 2)
        return [
            mpatches.Circle(center, radius=min(width, height) * 0.39, facecolor=MODIFICATION_TERRAIN_COLOR,
                            edgecolor=MODIFICATION_EDGE_COLOR, linewidth=0.65, transform=transform),
            Line2D([center[0] - width * 0.13, center[0] + width * 0.13], [center[1], center[1]],
                   color=MODIFICATION_EDGE_COLOR, linewidth=2.5, solid_capstyle="round", transform=transform),
            Line2D([center[0] - width * 0.13, center[0] + width * 0.13], [center[1], center[1]],
                   color="#F8F8F8", linewidth=1, solid_capstyle="round", transform=transform),
        ]


class ModificationEdgeHandle(Line2D):
    def __init__(self, color: str, label: str) -> None:
        super().__init__([], [], color=color, linewidth=2.4, label=label)


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


class ModificationEdgeHandler(HandlerBase):
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
        segments = (
            ((0.24, 0.5), (0.76, 0.5)),
            ((0.5, 0.20), (0.5, 0.80)),
            ((0.60, 0.25), (0.76, 0.5)),
            ((0.76, 0.5), (0.60, 0.75)),
        )
        return [
            Line2D(
                [xdescent + first[0] * width, xdescent + last[0] * width],
                [ydescent + first[1] * height, ydescent + last[1] * height],
                color=color,
                linewidth=line_width,
                solid_capstyle="round",
                transform=transform,
            )
            for color, line_width in (
                (MODIFICATION_EDGE_COLOR, 4.4),
                (original_handle.get_color(), 2.4),
            )
            for first, last in segments
        ]


class SpeedHandle(Line2D):
    def __init__(self, color: str, label: str) -> None:
        super().__init__([], [], color=color, label=label)


class SpeedHandler(HandlerBase):
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
        segments = [((0.05, 0.5), (0.95, 0.5))]
        double = original_handle.get_color() == MODIFICATION_ROBOT_CAPABILITY_COLOR
        for tip in (0.95, 0.60) if double else (0.95,):
            segments.extend(
                [((tip - 0.25, 0.10), (tip, 0.5)), ((tip, 0.5), (tip - 0.25, 0.90))]
            )
        return [
            Line2D(
                [xdescent + first[0] * width, xdescent + last[0] * width],
                [ydescent + first[1] * height, ydescent + last[1] * height],
                color=color,
                linewidth=line_width,
                solid_capstyle="round",
                transform=transform,
            )
            for color, line_width in (
                (MODIFICATION_EDGE_COLOR, 3.4),
                (original_handle.get_color(), 1.4),
            )
            for first, last in segments
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
            color=terrain_color_rgb(name, brandao=grid.isp_model == "BRANDAO"),
            label=f"{('fast' if name == 'GRASS' else 'slow') if grid.isp_model == 'BRANDAO' and name in {'GRASS', 'FOREST'} else name.lower().replace('_', ' ')} ({speed:g} m/s)",
        )
        for name, speed in grid.speeds.items()
        if grid.isp_model != "BRANDAO" or name in {"GRASS", "FOREST"}
    )
    handles.append(
        mpatches.Patch(
            facecolor=BRANDAO_BLOCKED_COLOR
            if grid.isp_model == "BRANDAO"
            else "#777B80",
            edgecolor="#282828",
            hatch="xx",
            label="Blocked"
            if grid.isp_model == "BRANDAO"
            else "Obstacle (terrain shade)",
        )
    )

    if modifications is not None:
        changes = (
            (
                sum(target == "GRASS" for _, target in modifications.terrain_assignments),
                MODIFICATION_TERRAIN_COLOR,
                "Slow to fast",
                ModificationDotHandle,
            ),
            (
                sum(target == "FOREST" for _, target in modifications.terrain_assignments),
                MODIFICATION_TERRAIN_COLOR,
                "Fast to slow",
                TerrainSlowHandle,
            ),
            (
                len(modifications.cell_openings),
                MODIFICATION_CELL_OPENING_COLOR,
                "Cells made traversable",
                ModificationDotHandle,
            ),
            (
                len(modifications.slope_adjustments),
                MODIFICATION_SLOPE_COLOR,
                "Directed slopes adjusted",
                ModificationEdgeHandle,
            ),
            (
                len(modifications.environmental_speed_edges),
                MODIFICATION_ENVIRONMENTAL_SPEED_COLOR,
                "Environmental speed limit removed",
                SpeedHandle,
            ),
            (
                len(modifications.robot_capability_edges),
                MODIFICATION_ROBOT_CAPABILITY_COLOR,
                "Hypothetical robot capability",
                SpeedHandle,
            ),
        )
        if any(count for count, _, _, _ in changes):
            add_section("Changes")
            for count, color, label, handle_type in changes:
                if count:
                    handles.append(handle_type(color, f"{label} ({count})"))

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
            TerrainSlowHandle: TerrainSlowHandler(),
            ModificationEdgeHandle: ModificationEdgeHandler(),
            SpeedHandle: SpeedHandler(),
        },
    )
    for label in legend.get_texts():
        if label.get_text() in section_labels:
            label.set_fontweight("bold")
            label.set_color("#282828")
