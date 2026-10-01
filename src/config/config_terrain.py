# Maximum traversable slope in degrees
MAX_SLOPE_DEG = 20.0

# Terrain definitions and nominal speeds (m/s)
TERRAINS = {
    "COMPACTED_SOIL": 1.2,
    "GRASSLAND": 1.0,
    "GRASS": 1.0,
    "UNPAVED_TRACK": 0.9,
    "DRY_VEGETATION": 0.8,
    "SAND": 0.6,
    "FOREST": 0.5,
    "MUD": 0.4,
    "ROCKY": 0.3,
    "WATER_RIVER": 0.0,
}

# Colors are stored as CSS-style hexadecimal values so the Web canvas and the
# Python renderers can consume the same palette.
TERRAIN_COLORS = {
    "COMPACTED_SOIL": "#9E6B47",
    "GRASSLAND": "#52A45B",
    "GRASS": "#2E9438",
    "UNPAVED_TRACK": "#B98457",
    "DRY_VEGETATION": "#BFC233",
    "SAND": "#FAD142",
    "FOREST": "#2F653A",
    "MUD": "#5C3829",
    "ROCKY": "#777B80",
    "WATER_RIVER": "#0585E6",
}

# Default base terrain for nominal traversability
BASE_TERRAIN = "GRASS"

# Automatically derived impassable terrains (zero or negative nominal speed).
IMPASSABLE_TERRAINS = {name for name, speed in TERRAINS.items() if speed <= 0.0}

# Maximum nominal speed derived automatically from the fastest terrain
V_MAX = max(TERRAINS.values())
