MAP_DEFAULT_SEED = 42

# Elevation amplitude is calibrated to create occasional slopes above 20 degrees.
MAP_ELEVATION_SCALE = 4.0
MAP_ELEVATION_FREQ = 0.06
MAP_ELEVATION_OCTAVES = 3

# Moisture and roughness use independent normalized Perlin fields.
MAP_MOISTURE_FREQ = 0.03
MAP_MOISTURE_OCTAVES = 2
MAP_ROUGHNESS_FREQ = 0.05
MAP_ROUGHNESS_OCTAVES = 2

# Elevation and moisture cutoffs used by the ordered terrain classifier.
MAP_TERRAIN_THRESHOLDS = {
    "LOWLAND_ELEVATION_MAX": 0.28,
    "WATER_MOISTURE_MIN": 0.70,
    "MUD_MOISTURE_MIN": 0.48,
    "ROCKY_ELEVATION_MIN": 0.76,
    "ROCKY_MOISTURE_MAX": 0.40,
    "FOREST_MOISTURE_MIN": 0.66,
    "DRY_MOISTURE_MAX": 0.34,
    "GRASSLAND_ELEVATION_MIN": 0.58,
}

# Roughness cutoffs are lower for forest and rocky terrain to create more obstacles.
MAP_ROUGHNESS_THRESHOLDS = {
    "FOREST": 0.74,
    "ROCKY": 0.72,
    "GRASSLAND": 0.88,
    "GRASS": 0.90,
    "DRY_VEGETATION": 0.90,
    "MUD": 0.97,
    "SAND": 0.98,
}

MAP_MIN_MAIN_COMPONENT_RATIO = 0.80
MAP_MAX_GENERATION_ATTEMPTS = 5
