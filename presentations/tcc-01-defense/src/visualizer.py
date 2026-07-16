from functools import cache

import config
from PIL import Image, ImageColor, ImageDraw

TILE_SIZE = config.TILE_SIZE
TEXTURE_DIR = config.TEXTURE_DIR
TEXTURE_FILES = {
    "hill1": "hill1.png",
    "hill2": "hill2.png",
    "hill3": "hill3.png",
    "hill4": "hill4.png",
    "hill5": "hill5.png",
    "water": "water.png",
    "grass": "grass.png",
    "obstacle": "obstacle.png",
}


@cache
def _load_textures():
    textures = {}
    for name, filename in TEXTURE_FILES.items():
        path = TEXTURE_DIR / filename
        try:
            with Image.open(path) as source:
                image = source.convert("RGBA")
            if image.size != (TILE_SIZE, TILE_SIZE):
                image = image.resize(
                    (TILE_SIZE, TILE_SIZE),
                    Image.Resampling.LANCZOS,
                )
            textures[name] = image
        except FileNotFoundError:
            fallback = Image.new(
                "RGBA",
                (TILE_SIZE, TILE_SIZE),
                (255, 0, 255, 255),
            )
            textures[name] = fallback
            print(f"Warning: Texture {path} not found. Using magenta fallback.")
    return textures


def _select_texture(cell, textures):
    if cell["terrain_type"] == "lake":
        return textures["water"]

    # Traversal costs map directly to the five hill texture levels.
    cost = max(1, min(5, cell["cost"]))
    return textures[f"hill{cost}"]


def _paste_cell_texture(image, textures, cell, position):
    if cell["terrain_type"] == "obstacle":
        image.paste(textures["grass"], position)
        image.alpha_composite(textures["obstacle"], dest=position)
        return

    image.paste(_select_texture(cell, textures), position)


def _build_texture_image(grid):
    textures = _load_textures()
    row_count = len(grid)
    column_count = len(grid[0])
    image = Image.new(
        "RGBA",
        (column_count * TILE_SIZE, row_count * TILE_SIZE),
        (0, 0, 0, 0),
    )

    for row in range(row_count):
        for column in range(column_count):
            position = (column * TILE_SIZE, row * TILE_SIZE)
            _paste_cell_texture(
                image,
                textures,
                grid[row][column],
                position,
            )

    return image


def _draw_path(draw, path, color, width=3):
    if not path:
        return

    points = [
        (
            column * TILE_SIZE + TILE_SIZE / 2,
            row * TILE_SIZE + TILE_SIZE / 2,
        )
        for row, column in path
    ]
    draw.line(points, fill=color, width=width)


def _draw_grid(draw, row_count, column_count, color=(200, 200, 200, 128)):
    for row in range(row_count + 1):
        y = row * TILE_SIZE
        draw.line((0, y, column_count * TILE_SIZE, y), fill=color, width=1)
    for column in range(column_count + 1):
        x = column * TILE_SIZE
        draw.line((x, 0, x, row_count * TILE_SIZE), fill=color, width=1)


def _as_rgba(color):
    if isinstance(color, str):
        return ImageColor.getrgb(color) + (255,)
    if isinstance(color, tuple):
        if len(color) == 3:
            return color + (255,)
        return color
    return (255, 255, 255, 255)


def _draw_marker(draw, position, color):
    row, column = position
    x1 = column * TILE_SIZE
    y1 = row * TILE_SIZE
    x2 = x1 + TILE_SIZE
    y2 = y1 + TILE_SIZE
    rgba_color = _as_rgba(color)
    draw.rectangle([x1, y1, x2, y2], fill=rgba_color, outline=rgba_color)


def _save_map(
    grid,
    start,
    goal,
    filename,
    grid_visible=False,
    path=None,
    path_color=None,
):
    image = _build_texture_image(grid)
    draw = ImageDraw.Draw(image)
    row_count = len(grid)
    column_count = len(grid[0])

    if grid_visible:
        _draw_grid(draw, row_count, column_count)
    if path and path_color is not None:
        _draw_path(draw, path, _as_rgba(path_color))

    _draw_marker(draw, start, config.START_COLOR)
    _draw_marker(draw, goal, config.GOAL_COLOR)

    config.IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    image.save(config.IMAGE_DIR / filename, "PNG")


def _save_continuous_map(grid, start, goal):
    _save_map(grid, start, goal, "continuous_map.png", grid_visible=False)


def _save_discretized_map(grid, start, goal):
    _save_map(grid, start, goal, "discretized_map.png", grid_visible=True)


def _save_manhattan_route_map(grid, start, goal):
    start_row, start_column = start
    goal_row, goal_column = goal
    path = [
        (start_row, start_column),
        (start_row, goal_column),
        (goal_row, goal_column),
    ]
    _save_map(
        grid,
        start,
        goal,
        "manhattan_map.png",
        grid_visible=True,
        path=path,
        path_color=config.MANHATTAN_ROUTE_COLOR,
    )


def _save_euclidean_route_map(grid, start, goal):
    path = [start, goal]
    _save_map(
        grid,
        start,
        goal,
        "euclidean_map.png",
        grid_visible=True,
        path=path,
        path_color=config.EUCLIDEAN_ROUTE_COLOR,
    )


def _save_astar_route_map(grid, start, goal, route):
    _save_map(
        grid,
        start,
        goal,
        "astar_map.png",
        grid_visible=True,
        path=route,
        path_color=config.ASTAR_ROUTE_COLOR,
    )


def generate_images(grid, start, goal, optimal_route):
    _save_continuous_map(grid, start, goal)
    _save_discretized_map(grid, start, goal)
    _save_manhattan_route_map(grid, start, goal)
    _save_euclidean_route_map(grid, start, goal)
    _save_astar_route_map(grid, start, goal, optimal_route)
    print("Images saved with textures.")
