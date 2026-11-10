MAP_DEFAULT_SEED = 42

MAP_PROFILE_VERSION = "perlin-v7"

# Larger presets use moderately smaller regions than the approved small maps.
MAP_PROFILE_FREQUENCIES = {
    (16, 32): 0.24,
    (32, 64): 0.12,
    (64, 128): 0.06,
    (128, 256): 0.04,
    (256, 512): 0.02,
    (512, 1024): 0.01,
    (1024, 2048): 0.005,
    (2048, 4096): 0.0025,
    (4096, 8192): 0.00125,
}
MAP_SIZE_OPTIONS = tuple(MAP_PROFILE_FREQUENCIES)

# Elevation amplitude is calibrated to create occasional slopes above 20 degrees.
MAP_ELEVATION_SCALE = 4.0
MAP_ELEVATION_FREQ = 0.06
MAP_ELEVATION_OCTAVES = 3
MAP_ELEVATION_PERSISTENCE = 0.5

# Moisture and roughness use independent normalized Perlin fields.
MAP_MOISTURE_FREQ = 0.03
MAP_MOISTURE_OCTAVES = 2
MAP_ROUGHNESS_FREQ = 0.05
MAP_ROUGHNESS_OCTAVES = 2

# Keep the smallest map at two octaves and use three for all other presets.
MAP_PROFILE_ELEVATION_DETAIL = {
    (16, 32): (2, 0.5),
    (32, 64): (3, 0.5),
    (64, 128): (3, 0.5),
    (128, 256): (3, 0.5),
    (256, 512): (3, 0.5),
    (512, 1024): (3, 0.5),
    (1024, 2048): (3, 0.5),
    (2048, 4096): (3, 0.5),
    (4096, 8192): (3, 0.5),
}

MAP_GENERATION_PROFILES = {
    (height, width): {
        "MAP_ELEVATION_SCALE": 0.24 / frequency,
        "MAP_ELEVATION_FREQ": frequency,
        "MAP_ELEVATION_OCTAVES": MAP_PROFILE_ELEVATION_DETAIL[(height, width)][0],
        "MAP_ELEVATION_PERSISTENCE": MAP_PROFILE_ELEVATION_DETAIL[(height, width)][1],
        "MAP_MOISTURE_FREQ": frequency / 2,
        "MAP_MOISTURE_OCTAVES": MAP_MOISTURE_OCTAVES,
        "MAP_ROUGHNESS_FREQ": frequency * 5 / 6,
        "MAP_ROUGHNESS_OCTAVES": MAP_ROUGHNESS_OCTAVES,
    }
    for (height, width), frequency in MAP_PROFILE_FREQUENCIES.items()
}

# Elevation and moisture cutoffs used by the ordered terrain classifier.
MAP_TERRAIN_THRESHOLDS = {
    "LOWLAND_ELEVATION_MAX": 0.28,
    "WATER_MOISTURE_MIN": 0.70,
    "WATER_MIN_COMPONENT_RATIO": 0.0015,
    "MUD_MOISTURE_MIN": 0.48,
    "ROCKY_ELEVATION_MIN": 0.76,
    "ROCKY_MOISTURE_MAX": 0.40,
    "FOREST_MOISTURE_MIN": 0.66,
    "DENSE_FOREST_MOISTURE_MIN": 0.82,
    "DRY_MOISTURE_MAX": 0.34,
    "GRASSLAND_ELEVATION_MIN": 0.58,
}

# Roughness cutoffs are lower for forest and rocky terrain to create more obstacles.
MAP_ROUGHNESS_THRESHOLDS = {
    "FOREST": 0.82,
    "ROCKY": 0.80,
    "GRASSLAND": 0.95,
    "GRASS": 0.95,
    "DRY_VEGETATION": 0.95,
    "MUD": 0.95,
    "SAND": 0.95,
}

MAP_MIN_MAIN_COMPONENT_RATIO = 0.70
MAP_MAX_GENERATION_ATTEMPTS = 5
