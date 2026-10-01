from src import config
from src.grid.grid import Grid
from src.map.generator import generate_map as create_map
from src.planning import plan_path
from src.visual.plotter import render_tactical_map

from .utils import get_project_path, prepare_endpoints


def generate_map(verbose: bool = True, persist_artifacts: bool = True) -> Grid:
    if verbose:
        print(
            f"[1] Generating procedural map ({config.MAP_H}x{config.MAP_W}, seed={config.MAP_DEFAULT_SEED})..."
        )

    grid = create_map(
        h=config.MAP_H,
        w=config.MAP_W,
        seed=config.MAP_DEFAULT_SEED,
        cell_size=config.CELL_SIZE,
        connectivity=config.CONNECTIVITY,
        max_slope_deg=config.MAX_SLOPE_DEG,
        elevation_scale=config.MAP_ELEVATION_SCALE,
        elevation_freq=config.MAP_ELEVATION_FREQ,
        biome_freq=config.MAP_BIOME_FREQ,
        obstacle_freq=config.MAP_OBSTACLE_FREQ,
        obstacle_threshold=config.MAP_OBSTACLE_THRESHOLD,
    )

    if persist_artifacts:
        _start, _goal = prepare_endpoints(grid)
        _p_star, _cost_star, _ = plan_path(
            grid, _start, _goal, algorithm=config.DEFAULT_PLANNER
        )

        out_base = get_project_path(config.OUTPUT_DIR)
        map_dir = out_base / "map"
        map_dir.mkdir(parents=True, exist_ok=True)

        map_json_path = map_dir / "map.json"
        grid.save(map_json_path)

        map_png_path = map_dir / "map.png"
        render_tactical_map(
            grid=grid,
            title=f"Base Map ({config.MAP_H}x{config.MAP_W}) - Seed {config.MAP_DEFAULT_SEED}",
            save_path=str(map_png_path),
            endpoints=(_start, _goal),
        )

        try:
            legacy_maps_dir = get_project_path(config.MAPS_DIR)
            legacy_maps_dir.mkdir(parents=True, exist_ok=True)
            grid.save(get_project_path(config.DEFAULT_MAP_FILE))
        except OSError:
            pass

        if verbose:
            print(f"Map saved: {map_json_path}")
            print(f"Map render: {map_png_path}")
    return grid
