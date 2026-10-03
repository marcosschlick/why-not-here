import math

from ..config import (
    CELL_SIZE,
    CONNECTIVITY,
    DEFAULT_TERRAIN,
    IMPASSABLE_TERRAINS,
    MAP_DEFAULT_SEED,
    MAP_ELEVATION_FREQ,
    MAP_ELEVATION_OCTAVES,
    MAP_ELEVATION_SCALE,
    MAP_H,
    MAP_MAX_GENERATION_ATTEMPTS,
    MAP_MIN_MAIN_COMPONENT_RATIO,
    MAP_MOISTURE_FREQ,
    MAP_MOISTURE_OCTAVES,
    MAP_ROUGHNESS_FREQ,
    MAP_ROUGHNESS_OCTAVES,
    MAP_ROUGHNESS_THRESHOLDS,
    MAP_TERRAIN_THRESHOLDS,
    MAP_W,
    MAX_SLOPE_DEG,
    TERRAINS,
)
from ..grid import Grid
from .elevation import generate_elevation_field
from .obstacles import generate_obstacle_matrix, generate_roughness_field
from .terrain import classify_terrain_matrix, generate_moisture_field
from .validation import largest_traversable_component_ratio


def _derive_seed(seed: int, attempt: int, field_offset: int) -> int:
    return (seed + attempt * 1_000_003 + field_offset) % (2**32)


def generate_map(
    h: int | None = None,
    w: int | None = None,
    seed: int | None = None,
    *,
    width: int | None = None,
    height: int | None = None,
    cell_size: float | None = None,
    connectivity: int = CONNECTIVITY,
    max_slope_deg: float | None = None,
    elevation_scale: float = MAP_ELEVATION_SCALE,
    elevation_freq: float = MAP_ELEVATION_FREQ,
    elevation_octaves: int = MAP_ELEVATION_OCTAVES,
    moisture_freq: float = MAP_MOISTURE_FREQ,
    moisture_octaves: int = MAP_MOISTURE_OCTAVES,
    roughness_freq: float = MAP_ROUGHNESS_FREQ,
    roughness_octaves: int = MAP_ROUGHNESS_OCTAVES,
    terrain_thresholds: dict[str, float] | None = None,
    roughness_thresholds: dict[str, float] | None = None,
    min_main_component_ratio: float = MAP_MIN_MAIN_COMPONENT_RATIO,
    max_generation_attempts: int = MAP_MAX_GENERATION_ATTEMPTS,
) -> Grid:
    rows = h if h is not None else (height if height is not None else MAP_H)
    cols = w if w is not None else (width if width is not None else MAP_W)
    seed_value = MAP_DEFAULT_SEED if seed is None else int(seed)
    cell_size_value = CELL_SIZE if cell_size is None else cell_size
    max_slope_value = MAX_SLOPE_DEG if max_slope_deg is None else max_slope_deg
    terrain_threshold_values = (
        MAP_TERRAIN_THRESHOLDS
        if terrain_thresholds is None
        else terrain_thresholds
    )
    roughness_threshold_values = (
        MAP_ROUGHNESS_THRESHOLDS
        if roughness_thresholds is None
        else roughness_thresholds
    )

    if rows < 1 or cols < 1:
        raise ValueError("Map height and width must be greater than zero.")
    if connectivity not in (4, 8):
        raise ValueError("Connectivity must be either 4 or 8.")
    if (
        not math.isfinite(min_main_component_ratio)
        or not 0.0 < min_main_component_ratio <= 1.0
    ):
        raise ValueError("Minimum main component ratio must be greater than 0 and at most 1.")
    if max_generation_attempts < 1:
        raise ValueError("Maximum generation attempts must be greater than zero.")

    best_ratio = 0.0
    for attempt in range(max_generation_attempts):
        elevation_normalized, elevation_meters = generate_elevation_field(
            height=rows,
            width=cols,
            seed=_derive_seed(seed_value, attempt, 0),
            frequency=elevation_freq,
            octaves=elevation_octaves,
            scale=elevation_scale,
        )
        moisture_field = generate_moisture_field(
            height=rows,
            width=cols,
            seed=_derive_seed(seed_value, attempt, 101),
            frequency=moisture_freq,
            octaves=moisture_octaves,
        )
        terrain_matrix = classify_terrain_matrix(
            elevation_field=elevation_normalized,
            moisture_field=moisture_field,
            thresholds=terrain_threshold_values,
            available_terrains=set(TERRAINS),
            default_terrain=DEFAULT_TERRAIN,
        )
        roughness_field = generate_roughness_field(
            height=rows,
            width=cols,
            seed=_derive_seed(seed_value, attempt, 202),
            frequency=roughness_freq,
            octaves=roughness_octaves,
        )
        obstacle_matrix = generate_obstacle_matrix(
            roughness_field=roughness_field,
            terrain_matrix=terrain_matrix,
            thresholds=roughness_threshold_values,
            impassable_terrains=IMPASSABLE_TERRAINS,
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

        component_ratio = largest_traversable_component_ratio(grid)
        best_ratio = max(best_ratio, component_ratio)
        if component_ratio >= min_main_component_ratio:
            return grid

    raise ValueError(
        "Failed to generate a map with a main traversable component ratio "
        f"of at least {min_main_component_ratio:.2f} after "
        f"{max_generation_attempts} attempts. Best ratio was {best_ratio:.2f}."
    )
