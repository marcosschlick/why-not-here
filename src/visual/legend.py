import matplotlib.patches as mpatches
import matplotlib.pyplot as plt

from ..grid import Grid
from ..isp import SemanticModifications
from .style import BASE_TERRAIN_COLORS, OBSTACLE_COLOR

BASE_TERRAIN_LABELS: list[tuple[str, str]] = [
    ("COMPACTED_SOIL", "COMPACTED_SOIL (1.2 m/s)"),
    ("GRASS", "GRASS (1.0 m/s)"),
    ("DRY_VEGETATION", "DRY_VEG (0.8 m/s)"),
    ("SAND", "SAND (0.6 m/s)"),
    ("MUD", "MUD (0.4 m/s)"),
    ("WATER_RIVER", "WATER_RIVER (0.0 m/s)"),
]


def build_tactical_legend(
    ax: plt.Axes,
    grid: Grid,
    has_steep: bool,
    modifications: SemanticModifications | None,
) -> None:
    legend_handles: list[mpatches.Patch] = [
        mpatches.Patch(color=BASE_TERRAIN_COLORS[name], label=label)
        for name, label in BASE_TERRAIN_LABELS
    ]
    legend_handles.append(mpatches.Patch(color=OBSTACLE_COLOR, label="Obstacle"))

    if has_steep:
        legend_handles.append(
            mpatches.Patch(
                facecolor="#FF5252",
                edgecolor="#D32F2F",
                hatch="//",
                alpha=0.4,
                label=f"Slope > {grid.max_slope_deg:.0f}°",
            )
        )

    if modifications is not None:
        if modifications.terrain_nodes:
            legend_handles.append(
                mpatches.Patch(
                    facecolor="#00E5FF",
                    edgecolor="#00B0FF",
                    alpha=0.45,
                    label=f"ISP Paved ({len(modifications.terrain_nodes)})",
                )
            )
        if modifications.obstacle_nodes:
            legend_handles.append(
                mpatches.Patch(
                    facecolor="#FF1744",
                    edgecolor="#D50000",
                    hatch="xx",
                    alpha=0.45,
                    label=f"ISP Cleared Obstacle ({len(modifications.obstacle_nodes)})",
                )
            )
        if modifications.slope_edges:
            legend_handles.append(
                mpatches.Patch(
                    facecolor="#AA00FF",
                    edgecolor="#AA00FF",
                    label=f"ISP Leveled Slope ({len(modifications.slope_edges)})",
                )
            )

    plot_handles, plot_labels = ax.get_legend_handles_labels()
    combined_handles = legend_handles + plot_handles
    combined_labels = [h.get_label() for h in legend_handles] + plot_labels

    unique_legend = {}
    for lbl, hnd in zip(combined_labels, combined_handles):
        if lbl not in unique_legend:
            unique_legend[lbl] = hnd

    ax.legend(
        unique_legend.values(),
        unique_legend.keys(),
        loc="upper left",
        bbox_to_anchor=(1.02, 1.0),
        borderaxespad=0,
        fontsize=9,
        framealpha=0.9,
    )
