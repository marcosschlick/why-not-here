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

# Default base terrain for nominal traversability
BASE_TERRAIN = "GRASS"

# Automatically derived impassable terrains (zero or negative nominal speed)
IMPASSABLE_TERRAINS = {name for name, speed in TERRAINS.items() if speed <= 0.0}

# Maximum nominal speed derived automatically from the fastest terrain
V_MAX = max(TERRAINS.values())
