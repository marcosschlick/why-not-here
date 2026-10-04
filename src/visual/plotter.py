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
    USER_PATH_COLOR,
    compute_layout,
)


def render_tactical_map(
    grid: Grid,
    optimal_path: list[tuple[int, int]] | None = None,
    user_path: list[tuple[int, int]] | None = None,
    modifications: SemanticModifications | None = None,
    modified_grid: Grid | None = None,
    title: str = "Tactical Grid Map",
    save_path: str | Path | None = None,
    show: bool = False,
    dpi: int = 150,
    endpoints: tuple[tuple[int, int], tuple[int, int]] | None = None,
) -> plt.Figure:
    target_grid = modified_grid if modified_grid is not None else grid
    layout = compute_layout(target_grid.h, target_grid.w)

    fig, ax = plt.subplots(figsize=(9.0, 7.8), dpi=dpi)
    rgb_img = create_grid_rgb_matrix(target_grid)
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
    ax.set_xticks(range(0, target_grid.w, step))
    ax.set_yticks(range(0, target_grid.h, step))
    ax.set_title(title, fontsize=12, fontweight="bold", pad=12)
    ax.set_xlabel("Column (j)", fontsize=10)
    ax.set_ylabel("Row (i)", fontsize=10)

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
    route_width = cell_width_points * 0.14
    edge_width = cell_width_points * 0.035

    if modifications is not None:
        draw_modifications(ax, modifications, edge_width)

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
            color=USER_PATH_COLOR,
            linewidth=route_width,
            zorder=5,
            shared_cells=shared_cells,
            offset_side=-1,
        )

    if optimal_path:
        draw_endpoints(
            ax,
            optimal_path[0],
            optimal_path[-1],
            radius=0.4,
            edge_width=edge_width,
        )
    elif user_path:
        draw_endpoints(
            ax,
            user_path[0],
            user_path[-1],
            radius=0.4,
            edge_width=edge_width,
        )
    elif endpoints:
        draw_endpoints(
            ax, endpoints[0], endpoints[1], radius=0.4, edge_width=edge_width
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
