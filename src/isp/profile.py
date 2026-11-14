from copy import deepcopy

from ..config import IMPASSABLE_TERRAINS
from ..grid import Grid
from .budget import check_deadline

BRANDAO_PROFILE_VERSION = "brandao-grid-v2"
FAST_TERRAINS = frozenset(
    {
        "COMPACTED_SOIL",
        "GRASSLAND",
        "GRASS",
        "UNPAVED_TRACK",
        "DRY_VEGETATION",
    }
)
SLOW_TERRAINS = frozenset({"SAND", "FOREST", "MUD", "ROCKY"})


def prepare_scenario_grid(
    grid: Grid, model: str, path: list[tuple[int, int]]
) -> tuple[Grid, dict]:
    prepared = deepcopy(grid)
    prepared.isp_model = model
    if model == "NORMAL":
        return prepared, {
            "version": None,
            "converted_blocked_cells": 0,
            "converted_nodes": [],
        }
    if model != "BRANDAO":
        raise ValueError("Unknown ISP model.")
    converted = []
    reasons = {"physical_obstacle": 0, "impassable_terrain": 0}
    interior = set(path[1:-1])
    for row in range(grid.h):
        check_deadline()
        for col in range(grid.w):
            node = (row, col)
            original = grid.get_cell(node)
            cell = prepared.get_cell(node)
            blocked_terrain = grid._get_effective_speed(node) <= 0 or (
                original.terrain in IMPASSABLE_TERRAINS
                and node not in grid.terrain_overrides
            )
            if node in interior and (original.obstacle or blocked_terrain):
                cell.terrain = "FOREST"
                cell.obstacle = 0
                converted.append(node)
                reasons["physical_obstacle"] += int(bool(original.obstacle))
                reasons["impassable_terrain"] += int(blocked_terrain)
            elif not blocked_terrain:
                if (
                    original.terrain not in FAST_TERRAINS | SLOW_TERRAINS
                    and node not in grid.terrain_overrides
                ):
                    raise ValueError(
                        f"No Brandao classification for terrain {original.terrain!r}."
                    )
                cell.terrain = (
                    "GRASS" if original.terrain in FAST_TERRAINS else "FOREST"
                )
    prepared.speeds = {
        "GRASS": 1.0,
        "FOREST": 0.125,
        **{name: 0.0 for name in IMPASSABLE_TERRAINS},
    }
    prepared.leveled_slopes.clear()
    prepared.terrain_overrides.clear()
    prepared.robot_speed_edges.clear()
    return prepared, {
        "version": BRANDAO_PROFILE_VERSION,
        "fast_terrains": sorted(FAST_TERRAINS),
        "slow_terrains": sorted(SLOW_TERRAINS),
        "fast_cost_sec_per_m": 1.0,
        "slow_cost_sec_per_m": 8.0,
        "converted_blocked_cells": len(converted),
        "converted_nodes": converted,
        "conversion_reasons": reasons,
        "slope_effects": False,
    }
