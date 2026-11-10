import math

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import LineCollection
from PIL import Image, ImageDraw

from ..grid import Grid
from .appearance import MAP_APPEARANCE


def texture_variant(texture: dict, row: int, col: int) -> dict:
    variants = texture["variants"]
    return variants[(row + col * 2) % len(variants)]


def _overview_atlas(texture: dict, line_width: float) -> np.ndarray:
    image = Image.new("L", (512, 512))
    draw = ImageDraw.Draw(image)
    size = 256
    width = max(1, round(size * line_width))
    for row in range(2):
        for col in range(2):
            motif = texture_variant(texture, row, col)
            for stroke in motif.get("strokes", []):
                points = [(size * (col + x), size * (row + y)) for x, y in stroke]
                draw.line(points, fill=255, width=width, joint="curve")
                for x, y in points:
                    radius = width / 2
                    draw.ellipse(
                        (x - radius, y - radius, x + radius, y + radius), fill=255
                    )
            for x, y, radius in motif.get("dots", []):
                center_x, center_y = size * (col + x), size * (row + y)
                radius *= size
                draw.ellipse(
                    (
                        center_x - radius,
                        center_y - radius,
                        center_x + radius,
                        center_y + radius,
                    ),
                    fill=255,
                )
    return np.asarray(image.resize((128, 128), Image.Resampling.LANCZOS))


def create_overview_texture_image(
    grid: Grid, cell_pixels: float, appearance: dict = MAP_APPEARANCE
) -> np.ndarray:
    overview = appearance["texture_overview"]
    width, height = (
        max(1, round(grid.w * cell_pixels)),
        max(1, round(grid.h * cell_pixels)),
    )
    image = np.zeros((height, width, 4), dtype=np.uint8)
    color = appearance["texture_color"]
    image[:, :, :3] = [int(color[index : index + 2], 16) for index in (1, 3, 5)]
    terrain_codes = {
        name: index
        for index, name in enumerate(appearance["terrain_textures"], start=1)
    }
    codes = np.array(
        [
            [
                terrain_codes.get(cell.terrain, 0) if not cell.obstacle else 0
                for cell in row
            ]
            for row in grid.cells
        ],
        dtype=np.uint8,
    )
    rows = np.minimum(
        grid.h - 1, ((np.arange(height) + 0.5) * grid.h / height).astype(int)
    )
    cols = np.minimum(
        grid.w - 1, ((np.arange(width) + 0.5) * grid.w / width).astype(int)
    )
    visible_codes = codes[np.ix_(rows, cols)]
    cells_per_tile = 2 ** math.ceil(math.log2(overview["target_pixels"] / cell_pixels))
    tile_pixels = cells_per_tile * cell_pixels
    pattern_x = (
        np.floor((np.arange(width) + 0.5) * 128 / (tile_pixels * 2)).astype(int) % 128
    )
    pattern_y = (
        np.floor((np.arange(height) + 0.5) * 128 / (tile_pixels * 2)).astype(int) % 128
    )
    for name, texture in appearance["terrain_textures"].items():
        mask = visible_codes == terrain_codes[name]
        if not mask.any():
            continue
        atlas = _overview_atlas(texture, overview["line_width"])
        alpha = atlas[np.ix_(pattern_y, pattern_x)]
        image[:, :, 3][mask] = np.rint(alpha[mask] * overview["opacity"]).astype(
            np.uint8
        )
    return image


def draw_map_textures(ax: plt.Axes, grid: Grid, cell_pixels: float) -> None:
    appearance = MAP_APPEARANCE
    if cell_pixels < appearance["texture_min_cell_pixels"]:
        image = create_overview_texture_image(grid, cell_pixels, appearance)
        ax.imshow(
            image,
            origin="upper",
            interpolation="nearest",
            extent=(-0.5, grid.w - 0.5, grid.h - 0.5, -0.5),
            zorder=1,
        )
        return
    cell_points = cell_pixels * 72 / ax.figure.dpi
    strokes, obstacle_strokes = [], []
    dot_x, dot_y, dot_sizes = [], [], []
    for row in range(grid.h):
        for col in range(grid.w):
            cell = grid.get_cell((row, col))
            if cell.obstacle:
                obstacle_strokes.extend(
                    [
                        [(col - 0.3, row + 0.3), (col + 0.3, row - 0.3)],
                        [(col - 0.3, row - 0.3), (col + 0.3, row + 0.3)],
                    ]
                )
                continue
            texture = texture_variant(
                appearance["terrain_textures"][cell.terrain], row, col
            )
            strokes.extend(
                [
                    [(col - 0.5 + x, row - 0.5 + y) for x, y in stroke]
                    for stroke in texture.get("strokes", [])
                ]
            )
            for x, y, radius in texture.get("dots", []):
                dot_x.append(col - 0.5 + x)
                dot_y.append(row - 0.5 + y)
                dot_sizes.append((radius * 2 * cell_points) ** 2)
    ax.add_collection(
        LineCollection(
            strokes,
            colors=appearance["texture_color"],
            linewidths=cell_points * appearance["texture_line_width"],
            alpha=appearance["texture_opacity"],
            capstyle="round",
            joinstyle="round",
            zorder=1,
        )
    )
    ax.add_collection(
        LineCollection(
            obstacle_strokes,
            colors=appearance["obstacle_texture_color"],
            linewidths=cell_points * 0.06,
            alpha=appearance["obstacle_texture_opacity"],
            capstyle="round",
            zorder=1,
        )
    )
    if dot_x:
        ax.scatter(
            dot_x,
            dot_y,
            s=dot_sizes,
            color=appearance["texture_color"],
            alpha=appearance["texture_opacity"],
            linewidths=0,
            zorder=1,
        )
