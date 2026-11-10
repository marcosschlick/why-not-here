import copy

from .. import config


def resolve_map_profile(height: int, width: int) -> dict:
    if height < 1 or width < 1:
        raise ValueError("Map dimensions must be greater than zero.")
    if (height, width) in config.MAP_GENERATION_PROFILES:
        parameters = copy.deepcopy(config.MAP_GENERATION_PROFILES[(height, width)])
    else:
        nearest_size = min(
            config.MAP_GENERATION_PROFILES,
            key=lambda size: (abs(max(size) - max(height, width)), max(size)),
        )
        parameters = copy.deepcopy(config.MAP_GENERATION_PROFILES[nearest_size])
        scale = max(height, width) / max(nearest_size)
        parameters["MAP_ELEVATION_SCALE"] *= scale
        for key in ("MAP_ELEVATION_FREQ", "MAP_MOISTURE_FREQ", "MAP_ROUGHNESS_FREQ"):
            parameters[key] /= scale
    return {
        "MAP_PROFILE_VERSION": config.MAP_PROFILE_VERSION,
        "CELL_SIZE": 1.0,
        **parameters,
        "MAP_TERRAIN_THRESHOLDS": copy.deepcopy(config.MAP_TERRAIN_THRESHOLDS),
        "MAP_ROUGHNESS_THRESHOLDS": copy.deepcopy(config.MAP_ROUGHNESS_THRESHOLDS),
        "MAP_MIN_MAIN_COMPONENT_RATIO": config.MAP_MIN_MAIN_COMPONENT_RATIO,
        "MAP_MAX_GENERATION_ATTEMPTS": config.MAP_MAX_GENERATION_ATTEMPTS,
    }


def map_profiles() -> list[dict]:
    return [
        {
            "height": height,
            "width": width,
            "parameters": resolve_map_profile(height, width),
        }
        for height, width in config.MAP_SIZE_OPTIONS
    ]
