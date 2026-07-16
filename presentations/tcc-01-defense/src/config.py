from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
TEXTURE_DIR = PROJECT_DIR / "textures"
IMAGE_DIR = PROJECT_DIR / "generated_images"

GRID_SIZE = 32
TILE_SIZE = 32
START = (2, 2)
GOAL = (29, 29)
# Supported values: "manhattan" and "euclidean".
ASTAR_HEURISTIC = "euclidean"
LAKE_CENTER = (20, 25)
LAKE_RADIUS = 4
HILLS = [
    {"center": (15, 7), "type": "high", "radius": 1, "step": 2},
    {"center": (8, 22), "type": "medium", "radius": 1, "step": 2},
    {"center": (26, 18), "type": "low", "radius": 2, "step": 2},
]

OBSTACLES = [
    (6, 8),
    (12, 15),
    (29, 26),
]

START_COLOR = (255, 0, 0)
GOAL_COLOR = (0, 255, 255)
MANHATTAN_ROUTE_COLOR = "yellow"
EUCLIDEAN_ROUTE_COLOR = "yellow"
ASTAR_ROUTE_COLOR = "white"
