import os

import config
from PIL import Image, ImageColor, ImageDraw

TILE_SIZE = getattr(config, "TILE_SIZE", 32)
TEXTURE_DIR = os.path.join(os.path.dirname(__file__), "..", "textures")
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

_textures = None


def _load_textures():
    global _textures
    if _textures is not None:
        return _textures

    _textures = {}
    for key, filename in TEXTURE_FILES.items():
        path = os.path.join(TEXTURE_DIR, filename)
        try:
            image = Image.open(path).convert("RGBA")
            if image.size != (TILE_SIZE, TILE_SIZE):
                image = image.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
            _textures[key] = image
        except FileNotFoundError:
            fallback = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (255, 0, 255, 255))
            _textures[key] = fallback
            print(f"Warning: Texture {path} not found. Using magenta fallback.")
    return _textures


def _build_texture_image(grid):
    textures = _load_textures()
    rows = len(grid)
    cols = len(grid[0])
    image = Image.new("RGBA", (cols * TILE_SIZE, rows * TILE_SIZE), (0, 0, 0, 0))

    for r in range(rows):
        for c in range(cols):
            cell = grid[r][c]
            terrain_type = cell["terrain_type"]
            if terrain_type == "obstacle":
                grass = textures.get(
                    "grass", Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 100, 0, 255))
                )
                image.paste(grass, (c * TILE_SIZE, r * TILE_SIZE))
                obstacle = textures["obstacle"]
                image.alpha_composite(obstacle, dest=(c * TILE_SIZE, r * TILE_SIZE))
                continue
            elif terrain_type == "lake":
                texture = textures["water"]
            else:
                cost = cell["cost"]
                if cost < 1:
                    cost = 1
                elif cost > 5:
                    cost = 5
                texture = textures[f"hill{cost}"]
            image.paste(texture, (c * TILE_SIZE, r * TILE_SIZE))
    return image


def _draw_path(draw, path, color, width=3):
    if not path:
        return
    points = []
    for r, c in path:
        x = c * TILE_SIZE + TILE_SIZE / 2
        y = r * TILE_SIZE + TILE_SIZE / 2
        points.append((x, y))
    draw.line(points, fill=color, width=width)


def _draw_grid(draw, rows, cols, color=(200, 200, 200, 128)):
    for r in range(rows + 1):
        y = r * TILE_SIZE
        draw.line((0, y, cols * TILE_SIZE, y), fill=color, width=1)
    for c in range(cols + 1):
        x = c * TILE_SIZE
        draw.line((x, 0, x, rows * TILE_SIZE), fill=color, width=1)


def _get_color(color):
    if isinstance(color, str):
        return ImageColor.getrgb(color) + (255,)
    if isinstance(color, tuple):
        if len(color) == 3:
            return color + (255,)
        return color
    return (255, 255, 255, 255)


def _save_generic_map(
    grid, start, goal, filename, grid_visible=False, path=None, path_color=None
):
    image = _build_texture_image(grid)
    draw = ImageDraw.Draw(image)

    rows = len(grid)
    cols = len(grid[0])

    if grid_visible:
        _draw_grid(draw, rows, cols)
    if path and path_color:
        color = _get_color(path_color)
        _draw_path(draw, path, color)
    start_row, start_column = start
    goal_row, goal_column = goal
    x1 = start_column * TILE_SIZE
    y1 = start_row * TILE_SIZE
    x2 = x1 + TILE_SIZE
    y2 = y1 + TILE_SIZE
    start_color = _get_color(config.START_COLOR)
    draw.rectangle([x1, y1, x2, y2], fill=start_color, outline=start_color)
    x1 = goal_column * TILE_SIZE
    y1 = goal_row * TILE_SIZE
    x2 = x1 + TILE_SIZE
    y2 = y1 + TILE_SIZE
    goal_color = _get_color(config.GOAL_COLOR)
    draw.rectangle([x1, y1, x2, y2], fill=goal_color, outline=goal_color)
    os.makedirs(config.IMAGE_DIR, exist_ok=True)
    file_path = os.path.join(config.IMAGE_DIR, filename)
    image.save(file_path, "PNG")


def _save_continuous_map(grid, start, goal):
    _save_generic_map(grid, start, goal, "continuous_map.png", grid_visible=False)


def _save_discretized_map(grid, start, goal):
    _save_generic_map(grid, start, goal, "discretized_map.png", grid_visible=True)


def _save_manhattan_route_map(grid, start, goal):
    start_row, start_column = start
    goal_row, goal_column = goal
    path = [
        (start_row, start_column),
        (start_row, goal_column),
        (goal_row, goal_column),
    ]
    _save_generic_map(
        grid,
        start,
        goal,
        "manhattan_map.png",
        grid_visible=True,
        path=path,
        path_color=config.MANHATTAN_ROUTE_COLOR,
    )


def _save_euclidean_line_map(grid, start, goal):
    start_row, start_column = start
    goal_row, goal_column = goal
    path = [(start_row, start_column), (goal_row, goal_column)]
    _save_generic_map(
        grid,
        start,
        goal,
        "euclidean_map.png",
        grid_visible=True,
        path=path,
        path_color=config.EUCLIDEAN_ROUTE_COLOR,
    )


def _save_astar_route_map(grid, start, goal, route):
    _save_generic_map(
        grid,
        start,
        goal,
        "astar_map.png",
        grid_visible=True,
        path=route,
        path_color=config.ASTAR_ROUTE_COLOR,
    )


def generate_images(grid, start, goal, astar_route):
    _save_continuous_map(grid, start, goal)
    _save_discretized_map(grid, start, goal)
    _save_manhattan_route_map(grid, start, goal)
    _save_euclidean_line_map(grid, start, goal)
    _save_astar_route_map(grid, start, goal, astar_route)
    print("Images saved with textures.")
