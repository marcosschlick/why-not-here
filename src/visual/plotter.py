from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from ..grid import Grid
from ..isp import SemanticModifications
from .layers import (
    create_grid_rgb_matrix,
    draw_endpoints,
    draw_modifications,
    draw_path,
)
from .legend import build_tactical_legend
from .style import (
    OPTIMAL_PATH_COLOR,
    ROUTE_WIDTH,
    USER_PATH_COLOR,
    USER_PATH_OUTLINE_COLOR,
    USER_PATH_OUTLINE_WIDTH,
    axis_ticks,
    compute_layout,
)


def render_tactical_map(
    grid: Grid,
    optimal_path: list[tuple[int, int]] | None = None,
    user_path: list[tuple[int, int]] | None = None,
    modifications: SemanticModifications | None = None,
    modified_grid: Grid | None = None,
    title: str = "Tactical map",
    save_path: str | Path | None = None,
    show: bool = False,
    dpi: int = 600,
    endpoints: tuple[tuple[int, int], tuple[int, int]] | None = None,
    subtitle: str | None = None,
) -> plt.Figure:
    target_grid = modified_grid if modified_grid is not None else grid
    layout = compute_layout(target_grid.h, target_grid.w)

    fig, ax = plt.subplots(figsize=(9.0, 7.8), dpi=dpi)
    rgb_img = create_grid_rgb_matrix(grid)
    ax.imshow(rgb_img, origin="upper", interpolation="nearest")

    if layout["show_grid"]:
        ax.set_xticks(np.arange(-0.5, target_grid.w, 1), minor=True)
        ax.set_yticks(np.arange(-0.5, target_grid.h, 1), minor=True)
        ax.grid(
            which="minor",
            color="white",
            linestyle="-",
            linewidth=layout["grid_lw"],
            alpha=layout["grid_alpha"],
        )
        ax.tick_params(which="minor", size=0)

    step = layout["tick_step"]
    ax.set_xticks(axis_ticks(target_grid.w, step))
    ax.set_yticks(axis_ticks(target_grid.h, step))
    ax.set_title(title, fontsize=12, fontweight="bold", pad=24)
    metadata = f"Grid: {target_grid.h} rows × {target_grid.w} columns"
    if subtitle:
        metadata = f"{metadata} · {subtitle}"
    ax.text(
        0.5,
        1.0,
        metadata,
        transform=ax.transAxes,
        ha="center",
        va="bottom",
        fontsize=8.5,
        color="#505050",
    )
    ax.set_xlabel("Column (j)", fontsize=10)
    ax.set_ylabel("Row (i; 0 at top)", fontsize=10)

    build_tactical_legend(
        ax=ax,
        grid=target_grid,
        modifications=modifications,
        show_optimal_path=bool(optimal_path),
        show_alternative_path=bool(user_path),
        show_endpoints=bool(optimal_path or user_path or endpoints),
    )

    plt.tight_layout()
    fig.canvas.draw()
    cell_width_pixels = abs(
        ax.transData.transform((1, 0))[0] - ax.transData.transform((0, 0))[0]
    )
    cell_width_points = cell_width_pixels * 72 / dpi
    route_width = cell_width_points * ROUTE_WIDTH
    user_path_outline_width = cell_width_points * USER_PATH_OUTLINE_WIDTH
    modification_edge_width = cell_width_points * 0.05
    endpoint_edge_width = cell_width_points * 0.035

    shared_cells = set(optimal_path or []) & set(user_path or [])

    if optimal_path:
        draw_path(
            ax=ax,
            path=optimal_path,
            color=OPTIMAL_PATH_COLOR,
            linewidth=route_width,
            zorder=5,
            shared_cells=shared_cells,
            offset_side=1,
        )

    if user_path:
        draw_path(
            ax=ax,
            path=user_path,
            color=USER_PATH_OUTLINE_COLOR,
            linewidth=user_path_outline_width,
            zorder=5,
            shared_cells=shared_cells,
            offset_side=-1,
        )
        draw_path(
            ax=ax,
            path=user_path,
            color=USER_PATH_COLOR,
            linewidth=route_width,
            zorder=5.1,
            shared_cells=shared_cells,
            offset_side=-1,
        )

    if modifications is not None:
        draw_modifications(ax, modifications, modification_edge_width)

    if optimal_path:
        draw_endpoints(
            ax,
            optimal_path[0],
            optimal_path[-1],
            radius=0.4,
            edge_width=endpoint_edge_width,
        )
    elif user_path:
        draw_endpoints(
            ax,
            user_path[0],
            user_path[-1],
            radius=0.4,
            edge_width=endpoint_edge_width,
        )
    elif endpoints:
        draw_endpoints(
            ax,
            endpoints[0],
            endpoints[1],
            radius=0.4,
            edge_width=endpoint_edge_width,
        )

    if save_path:
        path = Path(save_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        plt.savefig(path, bbox_inches="tight", dpi=dpi)
        if not show:
            plt.close(fig)

    if show:
        plt.show()

    return fig
