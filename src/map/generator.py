import math

from .. import config
from ..grid import Grid
from .elevation import generate_elevation_field
from .obstacles import generate_obstacle_matrix, generate_roughness_field
from .terrain import classify_terrain_matrix, generate_moisture_field
from .validation import largest_traversable_component_ratio


def _derive_attempt_seed(seed: int, attempt: int) -> int:
    if attempt == 0:
        return seed
    return (seed + attempt * 1_000_003) % (2**32)


def _derive_field_seed(seed: int, field_offset: int) -> int:
    return (seed + field_offset) % (2**32)


def generate_map(
    h: int | None = None,
    w: int | None = None,
    seed: int | None = None,
    *,
    width: int | None = None,
    height: int | None = None,
    cell_size: float | None = None,
    connectivity: int | None = None,
    max_slope_deg: float | None = None,
    elevation_scale: float | None = None,
    elevation_freq: float | None = None,
    elevation_octaves: int | None = None,
    moisture_freq: float | None = None,
    moisture_octaves: int | None = None,
    roughness_freq: float | None = None,
    roughness_octaves: int | None = None,
    terrain_thresholds: dict[str, float] | None = None,
    roughness_thresholds: dict[str, float] | None = None,
    min_main_component_ratio: float | None = None,
    max_generation_attempts: int | None = None,
) -> Grid:
    rows = h if h is not None else (height if height is not None else config.MAP_H)
    cols = w if w is not None else (width if width is not None else config.MAP_W)
    seed_value = config.MAP_DEFAULT_SEED if seed is None else int(seed)
    cell_size_value = config.CELL_SIZE if cell_size is None else cell_size
    connectivity = config.CONNECTIVITY if connectivity is None else connectivity
    max_slope_value = config.MAX_SLOPE_DEG if max_slope_deg is None else max_slope_deg
    elevation_scale = (
        config.MAP_ELEVATION_SCALE if elevation_scale is None else elevation_scale
    )
    elevation_freq = (
        config.MAP_ELEVATION_FREQ if elevation_freq is None else elevation_freq
    )
    elevation_octaves = (
        config.MAP_ELEVATION_OCTAVES if elevation_octaves is None else elevation_octaves
    )
    moisture_freq = config.MAP_MOISTURE_FREQ if moisture_freq is None else moisture_freq
    moisture_octaves = (
        config.MAP_MOISTURE_OCTAVES if moisture_octaves is None else moisture_octaves
    )
    roughness_freq = (
        config.MAP_ROUGHNESS_FREQ if roughness_freq is None else roughness_freq
    )
    roughness_octaves = (
        config.MAP_ROUGHNESS_OCTAVES if roughness_octaves is None else roughness_octaves
    )
    min_main_component_ratio = (
        config.MAP_MIN_MAIN_COMPONENT_RATIO
        if min_main_component_ratio is None
        else min_main_component_ratio
    )
    max_generation_attempts = (
        config.MAP_MAX_GENERATION_ATTEMPTS
        if max_generation_attempts is None
        else max_generation_attempts
    )
    terrain_threshold_values = (
        config.MAP_TERRAIN_THRESHOLDS
        if terrain_thresholds is None
        else terrain_thresholds
    )
    roughness_threshold_values = (
        config.MAP_ROUGHNESS_THRESHOLDS
        if roughness_thresholds is None
        else roughness_thresholds
    )

    if not isinstance(rows, int) or not isinstance(cols, int) or rows < 1 or cols < 1:
        raise ValueError("Map height and width must be greater than zero.")
    for name, value in (
        ("Cell size", cell_size_value),
        ("Elevation scale", elevation_scale),
        ("Elevation frequency", elevation_freq),
        ("Moisture frequency", moisture_freq),
        ("Roughness frequency", roughness_freq),
    ):
        if not math.isfinite(value) or value <= 0.0:
            raise ValueError(f"{name} must be finite and greater than zero.")
    for name, value in (
        ("Elevation octaves", elevation_octaves),
        ("Moisture octaves", moisture_octaves),
        ("Roughness octaves", roughness_octaves),
        ("Maximum generation attempts", max_generation_attempts),
    ):
        if not isinstance(value, int) or value < 1:
            raise ValueError(f"{name} must be an integer greater than zero.")
    if not math.isfinite(max_slope_value) or not 0.0 <= max_slope_value <= 90.0:
        raise ValueError("Maximum slope must be finite and between 0 and 90 degrees.")
    if connectivity not in (4, 8):
        raise ValueError("Connectivity must be either 4 or 8.")
    if (
        not math.isfinite(min_main_component_ratio)
        or not 0.0 < min_main_component_ratio <= 1.0
    ):
        raise ValueError(
            "Minimum main component ratio must be greater than 0 and at most 1."
        )

    best_ratio = 0.0
    for attempt in range(max_generation_attempts):
        effective_seed = _derive_attempt_seed(seed_value, attempt)
        elevation_normalized, elevation_meters = generate_elevation_field(
            height=rows,
            width=cols,
            seed=_derive_field_seed(effective_seed, 0),
            frequency=elevation_freq,
            octaves=elevation_octaves,
            scale=elevation_scale,
        )
        moisture_field = generate_moisture_field(
            height=rows,
            width=cols,
            seed=_derive_field_seed(effective_seed, 101),
            frequency=moisture_freq,
            octaves=moisture_octaves,
        )
        terrain_matrix = classify_terrain_matrix(
            elevation_field=elevation_normalized,
            moisture_field=moisture_field,
            thresholds=terrain_threshold_values,
            available_terrains=set(config.TERRAINS),
        )
        roughness_field = generate_roughness_field(
            height=rows,
            width=cols,
            seed=_derive_field_seed(effective_seed, 202),
            frequency=roughness_freq,
            octaves=roughness_octaves,
        )
        obstacle_matrix = generate_obstacle_matrix(
            roughness_field=roughness_field,
            terrain_matrix=terrain_matrix,
            thresholds=roughness_threshold_values,
            impassable_terrains=config.IMPASSABLE_TERRAINS,
        )

        grid = Grid(
            h=rows,
            w=cols,
            cell_size=cell_size_value,
            connectivity=connectivity,
            max_slope_deg=max_slope_value,
        )
        grid.load_elevation_matrix(elevation_meters.tolist())
        grid.load_terrain_matrix(terrain_matrix)
        grid.load_obstacle_matrix(obstacle_matrix)
        grid.base_seed = seed_value
        grid.effective_seed = effective_seed
        grid.generation_attempt = attempt

        component_ratio = largest_traversable_component_ratio(grid)
        best_ratio = max(best_ratio, component_ratio)
        if component_ratio >= min_main_component_ratio:
            return grid

    raise ValueError(
        "Failed to generate a map with a main traversable component ratio "
        f"of at least {min_main_component_ratio:.2f} after "
        f"{max_generation_attempts} attempts. Best ratio was {best_ratio:.2f}."
    )
