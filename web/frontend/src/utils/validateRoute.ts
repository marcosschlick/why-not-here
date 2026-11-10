import type { GridPoint } from "./geometry";

export function validateDrawingRoute(
  path: GridPoint[],
  start: GridPoint,
  goal: GridPoint,
  height: number,
  width: number,
  connectivity: number,
): string | null {
  if (!path.length || path[0][0] !== start[0] || path[0][1] !== start[1]) {
    return "The route must start at the start point.";
  }
  const visited = new Set<string>();
  for (let index = 0; index < path.length; index++) {
    const [row, column] = path[index];
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(column) ||
      row < 0 ||
      column < 0 ||
      row >= height ||
      column >= width
    ) {
      return "The route contains a point outside the map.";
    }
    const point = `${row},${column}`;
    if (visited.has(point))
      return "The route cannot visit the same cell twice.";
    visited.add(point);
    if (index > 0) {
      const [previousRow, previousColumn] = path[index - 1];
      const dr = Math.abs(row - previousRow);
      const dc = Math.abs(column - previousColumn);
      if (Math.max(dr, dc) !== 1 || (connectivity === 4 && dr + dc !== 1)) {
        return "The route must connect adjacent cells.";
      }
    }
  }
  const last = path[path.length - 1];
  if (last[0] !== goal[0] || last[1] !== goal[1])
    return "The route must reach the goal.";
  return null;
}
