import type { GridLayersData } from "../types";
import type { GridPoint } from "./geometry";

export function hasTerrainOverride(
  map: GridLayersData,
  point: GridPoint,
): boolean {
  return map.terrain_overrides.some(
    ([row, col]) => row === point[0] && col === point[1],
  );
}
