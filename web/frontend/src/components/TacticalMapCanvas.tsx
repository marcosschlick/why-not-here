import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useMapViewport } from "../utils/useMapViewport";
import { createReliefShader } from "../utils/mapRelief";
import {
  createOverviewPatterns,
  drawTextureMotif,
  textureVariant,
} from "../utils/mapTextures";
import type {
  MapAppearance,
  MapData,
  SemanticModificationsData,
} from "../types";
import type { GridPoint } from "../utils/geometry";

interface TacticalMapCanvasProps {
  mapData: MapData;
  userPath?: GridPoint[];
  optimalPath?: GridPoint[];
  modifications?: SemanticModificationsData | null;
  cellSize: number;
  zoomLevel?: number;
  hoveredCell?: GridPoint | null;
  isShiftDown?: boolean;
  dragOrigin?: GridPoint | null;
  isConnectedToGoal?: boolean;
  interactive?: boolean;
  className?: string;
  onPointerDown?: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave?: () => void;
  onRendered?: () => void;
}

type Rgb = [number, number, number];
type MarkerPoint = { row: number; col: number };
type MarkerGroup = { points: MarkerPoint[]; path: MarkerPoint[] };

const EMPTY_PATH: GridPoint[] = [];

function rgba([red, green, blue]: Rgb, alpha = 1): string {
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function shadedColor([red, green, blue]: Rgb): string {
  const channels = [red, green, blue].map((channel) =>
    Math.min(255, Math.max(0, Math.round(channel))),
  );
  return `rgb(${channels[0]},${channels[1]},${channels[2]})`;
}

function terrainColor(hexColor: string | undefined): Rgb {
  if (!hexColor || !/^#[0-9a-f]{6}$/i.test(hexColor)) {
    return [128, 128, 128];
  }
  return [
    Number.parseInt(hexColor.slice(1, 3), 16),
    Number.parseInt(hexColor.slice(3, 5), 16),
    Number.parseInt(hexColor.slice(5, 7), 16),
  ];
}

const START_RGB: Rgb = [0, 176, 255];
const START_EDGE_RGB: Rgb = [0, 51, 102];
const GOAL_RGB: Rgb = [255, 215, 0];
const GOAL_EDGE_RGB: Rgb = [102, 68, 0];
const USER_PATH_RGB: Rgb = [248, 248, 248];
const USER_PATH_OUTLINE_RGB: Rgb = [40, 40, 40];
const OPTIMAL_PATH_RGB: Rgb = [50, 125, 225];
const MODIFICATION_TERRAIN_RGB: Rgb = [255, 59, 141];
const MODIFICATION_ROBOT_CAPABILITY_RGB: Rgb = [198, 255, 0];
const MODIFICATION_SLOPE_RGB: Rgb = [168, 85, 247];
const MODIFICATION_CELL_OPENING_RGB: Rgb = [0, 201, 199];
const MODIFICATION_ENVIRONMENTAL_SPEED_RGB: Rgb = [255, 59, 141];
const MODIFICATION_EDGE_RGB: Rgb = [40, 40, 40];
const GRID_RGB: Rgb = [255, 255, 255];
const MODIFICATION_RADIUS = 0.39;
const MODIFICATION_EDGE_WIDTH = 0.05;
const SLOPE_MARKER_PATH_LENGTH = 0.5;
const SLOPE_MARKER_CROSS_LENGTH = 0.3;
const SLOPE_MARKER_WIDTH = 0.07;
const CELL_EDGE_WIDTH = 0.035;
const ROUTE_WIDTH = 0.14;
const USER_PATH_OUTLINE_WIDTH = 0.2;
const ENDPOINT_RADIUS = 0.4;

function pathWithSharedOffset(
  path: GridPoint[],
  sharedCells: Set<string>,
  offsetSide: number,
): { x: number; y: number }[] {
  return path.map(([row, col], index) => {
    const point = { x: col, y: row };
    if (!sharedCells.has(`${row},${col}`)) return point;

    const previous = path[index - 1] ?? path[index];
    const next = path[index + 1] ?? path[index];
    let tangentX = next[1] - previous[1];
    let tangentY = next[0] - previous[0];
    if (Math.hypot(tangentX, tangentY) === 0) {
      tangentX = next[1] - col || col - previous[1];
      tangentY = next[0] - row || row - previous[0];
    }

    const tangentLength = Math.hypot(tangentX, tangentY);
    if (tangentLength === 0) return point;
    if (tangentX < 0 || (tangentX === 0 && tangentY < 0)) {
      tangentX *= -1;
      tangentY *= -1;
    }

    const beforeIsShared =
      index > 0 &&
      sharedCells.has(`${path[index - 1][0]},${path[index - 1][1]}`);
    const afterIsShared =
      index + 1 < path.length &&
      sharedCells.has(`${path[index + 1][0]},${path[index + 1][1]}`);
    const transition = beforeIsShared && afterIsShared ? 1 : 0.5;
    const offset = (0.12 * offsetSide * transition) / tangentLength;
    return {
      x: col - tangentY * offset,
      y: row + tangentX * offset,
    };
  });
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  path: GridPoint[],
  color: Rgb,
  cellSize: number,
  lineWidth: number,
  sharedCells: Set<string>,
  offsetSide: number,
) {
  if (path.length === 0) return;

  const points = pathWithSharedOffset(path, sharedCells, offsetSide).map(
    ({ x, y }) => ({
      x: x * cellSize + cellSize / 2,
      y: y * cellSize + cellSize / 2,
    }),
  );

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incomingX = current.x - previous.x;
    const incomingY = current.y - previous.y;
    const outgoingX = next.x - current.x;
    const outgoingY = next.y - current.y;
    const incomingLength = Math.hypot(incomingX, incomingY);
    const outgoingLength = Math.hypot(outgoingX, outgoingY);
    const cross = incomingX * outgoingY - incomingY * outgoingX;

    if (incomingLength === 0 || outgoingLength === 0) {
      ctx.lineTo(current.x, current.y);
      continue;
    }

    if (Math.abs(cross) < 1e-6) {
      ctx.lineTo(current.x, current.y);
      continue;
    }

    const radius = Math.min(
      cellSize * 0.28,
      incomingLength * 0.4,
      outgoingLength * 0.4,
    );
    const entryX = current.x - (incomingX / incomingLength) * radius;
    const entryY = current.y - (incomingY / incomingLength) * radius;
    const exitX = current.x + (outgoingX / outgoingLength) * radius;
    const exitY = current.y + (outgoingY / outgoingLength) * radius;

    ctx.lineTo(entryX, entryY);
    ctx.quadraticCurveTo(current.x, current.y, exitX, exitY);
  }
  const lastPoint = points[points.length - 1];
  ctx.lineTo(lastPoint.x, lastPoint.y);
  ctx.strokeStyle = rgba(color);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawModificationCircle(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  color: Rgb,
  cellSize: number,
) {
  ctx.beginPath();
  ctx.arc(centerX, centerY, cellSize * MODIFICATION_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = rgba(color);
  ctx.fill();
  ctx.strokeStyle = rgba(MODIFICATION_EDGE_RGB);
  ctx.lineWidth = cellSize * MODIFICATION_EDGE_WIDTH;
  ctx.stroke();
}

function drawSpeedArrow(
  ctx: CanvasRenderingContext2D,
  from: GridPoint,
  to: GridPoint,
  cellSize: number,
  color: Rgb,
  double: boolean,
) {
  const angle = Math.atan2(to[0] - from[0], to[1] - from[1]);
  if (from[0] === to[0] && from[1] === to[1]) return;
  ctx.save();
  ctx.translate(
    ((from[1] + to[1] + 1) / 2 - Math.sin(angle) * 0.46) * cellSize,
    ((from[0] + to[0] + 1) / 2 + Math.cos(angle) * 0.46) * cellSize,
  );
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-0.25 * cellSize, 0);
  ctx.lineTo(0.25 * cellSize, 0);
  for (const tip of double ? [0.25, 0.05] : [0.25]) {
    ctx.moveTo((tip - 0.13) * cellSize, -0.1 * cellSize);
    ctx.lineTo(tip * cellSize, 0);
    ctx.lineTo((tip - 0.13) * cellSize, 0.1 * cellSize);
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = rgba(MODIFICATION_EDGE_RGB);
  ctx.lineWidth = 0.17 * cellSize;
  ctx.stroke();
  ctx.strokeStyle = rgba(color);
  ctx.lineWidth = 0.07 * cellSize;
  ctx.stroke();
  ctx.restore();
}

function drawSlopeEdge(
  ctx: CanvasRenderingContext2D,
  from: GridPoint,
  to: GridPoint,
  color: Rgb,
  cellSize: number,
) {
  const rowDelta = to[0] - from[0];
  const colDelta = to[1] - from[1];
  const edgeLength = Math.hypot(rowDelta, colDelta);
  if (edgeLength === 0) return;

  const centerX = ((from[1] + to[1] + 1) / 2) * cellSize;
  const centerY = ((from[0] + to[0] + 1) / 2) * cellSize;
  const halfPathLength = (cellSize * SLOPE_MARKER_PATH_LENGTH) / 2;
  const halfCrossLength = (cellSize * SLOPE_MARKER_CROSS_LENGTH) / 2;
  const directionX = colDelta / edgeLength;
  const directionY = rowDelta / edgeLength;
  const perpendicularX = -directionY;
  const perpendicularY = directionX;

  ctx.save();
  ctx.lineCap = "round";
  const segments: [number, number, number, number][] = [
    [
      centerX - directionX * halfPathLength,
      centerY - directionY * halfPathLength,
      centerX + directionX * halfPathLength,
      centerY + directionY * halfPathLength,
    ],
    [
      centerX - perpendicularX * halfCrossLength,
      centerY - perpendicularY * halfCrossLength,
      centerX + perpendicularX * halfCrossLength,
      centerY + perpendicularY * halfCrossLength,
    ],
  ];
  const tipX = centerX + directionX * halfPathLength;
  const tipY = centerY + directionY * halfPathLength;
  for (const side of [-1, 1]) {
    segments.push([
      tipX -
        directionX * cellSize * 0.1 +
        perpendicularX * side * cellSize * 0.07,
      tipY -
        directionY * cellSize * 0.1 +
        perpendicularY * side * cellSize * 0.07,
      tipX,
      tipY,
    ]);
  }
  const drawSegments = (strokeColor: Rgb, lineWidth: number) => {
    for (const [startX, startY, endX, endY] of segments) {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = rgba(strokeColor);
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  };
  drawSegments(
    MODIFICATION_EDGE_RGB,
    cellSize * (SLOPE_MARKER_WIDTH + 2 * MODIFICATION_EDGE_WIDTH),
  );
  drawSegments(color, cellSize * SLOPE_MARKER_WIDTH);
  ctx.restore();
}

function groupModificationPoints(points: MarkerPoint[]): MarkerGroup[] {
  const neighbors = points.map(() => [] as number[]);
  const buckets = new Map<string, number[]>();

  points.forEach((point, index) => {
    const bucketRow = Math.floor(point.row);
    const bucketCol = Math.floor(point.col);

    for (let row = bucketRow - 1; row <= bucketRow + 1; row += 1) {
      for (let col = bucketCol - 1; col <= bucketCol + 1; col += 1) {
        const candidates = buckets.get(`${row},${col}`) ?? [];
        for (const candidateIndex of candidates) {
          const candidate = points[candidateIndex];
          if (
            Math.abs(point.row - candidate.row) <= 1 &&
            Math.abs(point.col - candidate.col) <= 1
          ) {
            neighbors[index].push(candidateIndex);
            neighbors[candidateIndex].push(index);
          }
        }
      }
    }

    const key = `${bucketRow},${bucketCol}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });

  const visited = new Set<number>();
  const groups: MarkerGroup[] = [];
  const orderedNeighbors = (currentIndex: number) => {
    const current = points[currentIndex];
    return [...neighbors[currentIndex]].sort((left, right) => {
      const leftPoint = points[left];
      const rightPoint = points[right];
      const leftRowDistance = Math.abs(current.row - leftPoint.row);
      const leftColDistance = Math.abs(current.col - leftPoint.col);
      const rightRowDistance = Math.abs(current.row - rightPoint.row);
      const rightColDistance = Math.abs(current.col - rightPoint.col);
      const leftAxes =
        Number(leftRowDistance > 0) + Number(leftColDistance > 0);
      const rightAxes =
        Number(rightRowDistance > 0) + Number(rightColDistance > 0);
      const leftDistance = leftRowDistance ** 2 + leftColDistance ** 2;
      const rightDistance = rightRowDistance ** 2 + rightColDistance ** 2;

      return (
        leftAxes - rightAxes ||
        leftDistance - rightDistance ||
        leftPoint.row - rightPoint.row ||
        leftPoint.col - rightPoint.col ||
        left - right
      );
    });
  };

  for (let start = 0; start < points.length; start += 1) {
    if (visited.has(start)) continue;

    const groupPoints = [points[start]];
    const path = [points[start]];
    visited.add(start);
    const traversal = [
      { index: start, neighbors: orderedNeighbors(start), nextNeighbor: 0 },
    ];

    while (traversal.length > 0) {
      const current = traversal[traversal.length - 1];
      if (current.nextNeighbor >= current.neighbors.length) {
        traversal.pop();
        if (traversal.length > 0) {
          path.push(points[traversal[traversal.length - 1].index]);
        }
        continue;
      }

      const neighborIndex = current.neighbors[current.nextNeighbor];
      current.nextNeighbor += 1;
      if (visited.has(neighborIndex)) continue;

      visited.add(neighborIndex);
      groupPoints.push(points[neighborIndex]);
      path.push(points[neighborIndex]);
      traversal.push({
        index: neighborIndex,
        neighbors: orderedNeighbors(neighborIndex),
        nextNeighbor: 0,
      });
    }

    groups.push({ points: groupPoints, path });
  }

  return groups;
}

function drawModificationGroup(
  ctx: CanvasRenderingContext2D,
  group: MarkerGroup,
  color: Rgb,
  cellSize: number,
) {
  if (group.points.length === 1) {
    const point = group.points[0];
    drawModificationCircle(
      ctx,
      (point.col + 0.5) * cellSize,
      (point.row + 0.5) * cellSize,
      color,
      cellSize,
    );
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const drawPath = () => {
    const firstPoint = group.path[0];
    ctx.beginPath();
    ctx.moveTo(
      (firstPoint.col + 0.5) * cellSize,
      (firstPoint.row + 0.5) * cellSize,
    );
    for (const point of group.path.slice(1)) {
      ctx.lineTo((point.col + 0.5) * cellSize, (point.row + 0.5) * cellSize);
    }
    ctx.closePath();
    ctx.stroke();
  };

  ctx.strokeStyle = rgba(MODIFICATION_EDGE_RGB);
  ctx.lineWidth =
    cellSize * (MODIFICATION_RADIUS * 2 + 2 * MODIFICATION_EDGE_WIDTH);
  drawPath();

  ctx.strokeStyle = rgba(color);
  ctx.lineWidth = cellSize * MODIFICATION_RADIUS * 2;
  drawPath();
  ctx.restore();
}

function drawModificationPoints(
  ctx: CanvasRenderingContext2D,
  points: MarkerPoint[],
  color: Rgb,
  cellSize: number,
) {
  for (const group of groupModificationPoints(points)) {
    drawModificationGroup(ctx, group, color, cellSize);
  }
}

function drawModificationCells(
  ctx: CanvasRenderingContext2D,
  points: GridPoint[],
  color: Rgb,
  cellSize: number,
) {
  drawModificationPoints(
    ctx,
    points.map(([row, col]) => ({ row, col })),
    color,
    cellSize,
  );
}

function drawTerrainTexture(
  ctx: CanvasRenderingContext2D,
  appearance: MapAppearance,
  terrain: string,
  x: number,
  y: number,
  size: number,
  row: number,
  col: number,
) {
  const texture = appearance.terrain_textures[terrain];
  if (!texture) return;
  ctx.save();
  ctx.globalAlpha = appearance.texture_opacity;
  ctx.strokeStyle = appearance.texture_color;
  ctx.fillStyle = appearance.texture_color;
  ctx.lineWidth = size * appearance.texture_line_width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawTextureMotif(ctx, textureVariant(texture, row, col), x, y, size);
  ctx.restore();
}

function drawHatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + width * 0.2, y + height * 0.8);
  ctx.lineTo(x + width * 0.8, y + height * 0.2);
  ctx.moveTo(x + width * 0.2, y + height * 0.2);
  ctx.lineTo(x + width * 0.8, y + height * 0.8);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.min(width, height) * 0.06;
  ctx.stroke();
  ctx.restore();
}

export function TacticalMapCanvas({
  mapData,
  userPath = EMPTY_PATH,
  optimalPath = EMPTY_PATH,
  modifications,
  cellSize,
  zoomLevel = 1,
  hoveredCell,
  isShiftDown = false,
  dragOrigin,
  isConnectedToGoal = false,
  interactive = false,
  className = "",
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onRendered,
}: TacticalMapCanvasProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [deviceScale] = useState<number>(() =>
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  );
  const { h, w, start, goal, terrain, elevation, obstacle } = mapData;
  const effectiveCellSize = cellSize * zoomLevel;
  const logicalWidth = Math.max(1, w * effectiveCellSize);
  const logicalHeight = Math.max(1, h * effectiveCellSize);
  const viewport = useMapViewport(rootRef, logicalWidth, logicalHeight);
  const renderScale = Math.min(
    deviceScale,
    4096 / Math.max(1, viewport.width, viewport.height),
  );

  const overviewPatterns = useMemo(
    () => createOverviewPatterns(mapData.appearance, effectiveCellSize),
    [mapData.appearance, effectiveCellSize],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pixelWidth = Math.max(1, Math.round(viewport.width * renderScale));
    const pixelHeight = Math.max(1, Math.round(viewport.height * renderScale));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (canvas.style.width !== `${viewport.width}px`) {
      canvas.style.width = `${viewport.width}px`;
    }
    if (canvas.style.height !== `${viewport.height}px`) {
      canvas.style.height = `${viewport.height}px`;
    }
    ctx.setTransform(
      renderScale,
      0,
      0,
      renderScale,
      -viewport.x * renderScale,
      -viewport.y * renderScale,
    );

    const step = Math.max(1, Math.floor(1 / effectiveCellSize));
    const firstRow = Math.max(
      0,
      Math.floor(viewport.y / effectiveCellSize / step) * step,
    );
    const firstCol = Math.max(
      0,
      Math.floor(viewport.x / effectiveCellSize / step) * step,
    );
    const lastRow = Math.min(
      h,
      Math.ceil((viewport.y + viewport.height) / effectiveCellSize),
    );
    const lastCol = Math.min(
      w,
      Math.ceil((viewport.x + viewport.width) / effectiveCellSize),
    );
    const appearance = mapData.appearance;
    const reliefShader = createReliefShader(
      elevation,
      mapData.cell_size,
      appearance.relief,
    );
    for (let row = firstRow; row < lastRow; row += step) {
      for (let col = firstCol; col < lastCol; col += step) {
        const x = Math.round(col * effectiveCellSize);
        const y = Math.round(row * effectiveCellSize);
        const width =
          Math.round(Math.min(w, col + step) * effectiveCellSize) - x;
        const height =
          Math.round(Math.min(h, row + step) * effectiveCellSize) - y;
        const terrainName = terrain[row]?.[col] || "GRASS";
        const isObstacle = (obstacle[row]?.[col] ?? 0) !== 0;
        const isBrandao = mapData.isp_model === "BRANDAO";
        const blocked = isObstacle || (mapData.speeds[terrainName] ?? 0) <= 0;
        const baseTerrainColor = terrainColor(
          mapData.terrain_colors[terrainName],
        );
        const baseColor =
          isObstacle && terrainName !== "WATER_RIVER"
            ? (baseTerrainColor.map(
                (channel) => channel * appearance.obstacle_shade,
              ) as Rgb)
            : baseTerrainColor;
        ctx.fillStyle = shadedColor(
          isBrandao
            ? blocked
              ? [40, 40, 40]
              : baseTerrainColor
            : terrainName === "WATER_RIVER"
              ? baseTerrainColor
              : reliefShader(baseColor, row, col),
        );
        ctx.fillRect(x, y, width, height);

        if (
          !isBrandao &&
          effectiveCellSize >= appearance.texture_min_cell_pixels
        ) {
          if (isObstacle) {
            drawHatch(
              ctx,
              x,
              y,
              width,
              height,
              rgba(
                terrainColor(appearance.obstacle_texture_color),
                appearance.obstacle_texture_opacity,
              ),
            );
          } else {
            drawTerrainTexture(
              ctx,
              appearance,
              terrainName,
              x,
              y,
              effectiveCellSize,
              row,
              col,
            );
          }
        } else if (!isBrandao && !isObstacle) {
          const pattern = overviewPatterns.get(terrainName);
          if (pattern) {
            ctx.fillStyle = pattern;
            ctx.globalAlpha = appearance.texture_overview.opacity;
            ctx.fillRect(x, y, width, height);
            ctx.globalAlpha = 1;
          }
        }

        if (effectiveCellSize >= 10) {
          ctx.strokeStyle = rgba(GRID_RGB, 0.16);
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, width, height);
        }
      }
    }

    const terrainNodes = modifications?.terrain_nodes ?? [];
    const openingNodes =
      modifications?.cell_openings.map(({ cell }) => cell) ?? [];
    const userPathCells = new Set(
      userPath.map(([row, col]) => `${row},${col}`),
    );
    const sharedCells = new Set(
      optimalPath
        .filter(([row, col]) => userPathCells.has(`${row},${col}`))
        .map(([row, col]) => `${row},${col}`),
    );
    const routeLineWidth = effectiveCellSize * ROUTE_WIDTH;
    drawPath(
      ctx,
      optimalPath,
      OPTIMAL_PATH_RGB,
      effectiveCellSize,
      routeLineWidth,
      sharedCells,
      1,
    );
    drawPath(
      ctx,
      userPath,
      USER_PATH_OUTLINE_RGB,
      effectiveCellSize,
      effectiveCellSize * USER_PATH_OUTLINE_WIDTH,
      sharedCells,
      -1,
    );
    drawPath(
      ctx,
      userPath,
      USER_PATH_RGB,
      effectiveCellSize,
      routeLineWidth,
      sharedCells,
      -1,
    );

    drawModificationCells(
      ctx,
      terrainNodes,
      MODIFICATION_TERRAIN_RGB,
      effectiveCellSize,
    );
    drawModificationCells(
      ctx,
      openingNodes,
      MODIFICATION_CELL_OPENING_RGB,
      effectiveCellSize,
    );
    for (const {
      edge: [from, to],
    } of modifications?.slope_adjustments ?? []) {
      drawSlopeEdge(ctx, from, to, MODIFICATION_SLOPE_RGB, effectiveCellSize);
    }
    for (const [records, color, double] of [
      [
        modifications?.environmental_speed_edges ?? [],
        MODIFICATION_ENVIRONMENTAL_SPEED_RGB,
        false,
      ],
      [
        modifications?.robot_capability_edges ?? [],
        MODIFICATION_ROBOT_CAPABILITY_RGB,
        true,
      ],
    ] as const) {
      for (const {
        edge: [from, to],
      } of records) {
        drawSpeedArrow(ctx, from, to, effectiveCellSize, color, double);
      }
    }

    const startX = start[1] * effectiveCellSize + effectiveCellSize / 2;
    const startY = start[0] * effectiveCellSize + effectiveCellSize / 2;
    const markerRadius = effectiveCellSize * ENDPOINT_RADIUS;
    ctx.save();
    ctx.translate(startX, startY);
    ctx.beginPath();
    ctx.moveTo(0, -markerRadius);
    ctx.lineTo(markerRadius, 0);
    ctx.lineTo(0, markerRadius);
    ctx.lineTo(-markerRadius, 0);
    ctx.closePath();
    ctx.fillStyle = rgba(START_RGB);
    ctx.fill();
    ctx.strokeStyle = rgba(START_EDGE_RGB);
    ctx.lineWidth = effectiveCellSize * CELL_EDGE_WIDTH;
    ctx.stroke();
    ctx.restore();

    const goalX = goal[1] * effectiveCellSize + effectiveCellSize / 2;
    const goalY = goal[0] * effectiveCellSize + effectiveCellSize / 2;
    ctx.beginPath();
    ctx.moveTo(goalX, goalY - markerRadius);
    ctx.lineTo(goalX + markerRadius, goalY);
    ctx.lineTo(goalX, goalY + markerRadius);
    ctx.lineTo(goalX - markerRadius, goalY);
    ctx.closePath();
    ctx.fillStyle = rgba(GOAL_RGB);
    ctx.fill();
    ctx.strokeStyle = rgba(GOAL_EDGE_RGB);
    ctx.lineWidth = effectiveCellSize * CELL_EDGE_WIDTH;
    ctx.stroke();
    const frame = requestAnimationFrame(() => onRendered?.());
    return () => cancelAnimationFrame(frame);
  }, [
    cellSize,
    deviceScale,
    viewport,
    elevation,
    effectiveCellSize,
    goal,
    h,
    logicalHeight,
    logicalWidth,
    mapData,
    modifications,
    obstacle,
    overviewPatterns,
    optimalPath,
    renderScale,
    start,
    terrain,
    userPath,
    w,
    zoomLevel,
    onRendered,
  ]);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pixelWidth = Math.max(1, Math.round(viewport.width * renderScale));
    const pixelHeight = Math.max(1, Math.round(viewport.height * renderScale));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (canvas.style.width !== `${viewport.width}px`) {
      canvas.style.width = `${viewport.width}px`;
    }
    if (canvas.style.height !== `${viewport.height}px`) {
      canvas.style.height = `${viewport.height}px`;
    }
    ctx.setTransform(
      renderScale,
      0,
      0,
      renderScale,
      -viewport.x * renderScale,
      -viewport.y * renderScale,
    );
    ctx.clearRect(viewport.x, viewport.y, viewport.width, viewport.height);

    if (!hoveredCell) return;
    const [row, col] = hoveredCell;
    if (row < 0 || row >= h || col < 0 || col >= w) return;

    const x = Math.round(col * effectiveCellSize);
    const y = Math.round(row * effectiveCellSize);
    const width = Math.round(Math.min(w, col + 1) * effectiveCellSize) - x;
    const height = Math.round(Math.min(h, row + 1) * effectiveCellSize) - y;
    ctx.strokeStyle = rgba(START_RGB);
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    if (isShiftDown && !isConnectedToGoal) {
      const origin =
        dragOrigin ??
        (userPath.length > 0 ? userPath[userPath.length - 1] : start);
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(
        origin[1] * effectiveCellSize + effectiveCellSize / 2,
        origin[0] * effectiveCellSize + effectiveCellSize / 2,
      );
      ctx.lineTo(
        col * effectiveCellSize + effectiveCellSize / 2,
        row * effectiveCellSize + effectiveCellSize / 2,
      );
      ctx.strokeStyle = rgba(START_RGB, 0.85);
      ctx.lineWidth = Math.max(1.5, effectiveCellSize * 0.2);
      ctx.stroke();
      ctx.restore();
    }
  }, [
    viewport,
    dragOrigin,
    effectiveCellSize,
    h,
    hoveredCell,
    isConnectedToGoal,
    isShiftDown,
    logicalHeight,
    logicalWidth,
    renderScale,
    start,
    userPath,
    w,
  ]);

  return (
    <div
      ref={rootRef}
      className={`tactical-map-canvas ${className}`}
      style={{
        width: `${logicalWidth + 2}px`,
        height: `${logicalHeight + 2}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        className="map-canvas-layer map-canvas-base"
        style={{
          left: viewport.x,
          top: viewport.y,
          width: viewport.width,
          height: viewport.height,
        }}
        aria-hidden="true"
      />
      <canvas
        ref={overlayRef}
        className={`map-canvas-layer interactive-canvas ${
          interactive ? "" : "is-read-only"
        } ${isConnectedToGoal ? "is-locked" : ""}`}
        style={{
          left: viewport.x,
          top: viewport.y,
          width: viewport.width,
          height: viewport.height,
        }}
        data-offset-x={viewport.x}
        data-offset-y={viewport.y}
        aria-label="Tactical map"
        role={interactive ? undefined : "img"}
        onPointerDown={interactive ? onPointerDown : undefined}
        onPointerMove={onPointerMove}
        onPointerUp={interactive ? onPointerUp : undefined}
        onPointerCancel={interactive ? onPointerUp : undefined}
        onPointerLeave={onPointerLeave}
      />
    </div>
  );
}

export function TacticalMapLegend({
  mapData,
  modifications,
  showOptimalPath,
  showAlternativePath = true,
  alternativePathLabel = "p′ · Alternative",
}: {
  mapData: MapData;
  modifications?: SemanticModificationsData | null;
  showOptimalPath?: boolean;
  showAlternativePath?: boolean;
  alternativePathLabel?: string;
}) {
  const terrainCount = modifications?.terrain ?? 0;
  const openingCount = modifications?.cell_opening ?? 0;
  const slopeCount = modifications?.slope ?? 0;
  const environmentalCount = modifications?.environmental_speed ?? 0;
  const capabilityCount = modifications?.robot_capability ?? 0;
  const hasChanges =
    terrainCount +
      openingCount +
      slopeCount +
      environmentalCount +
      capabilityCount >
    0;

  return (
    <div className="canvas-legend" aria-label="Map legend">
      {(showOptimalPath || showAlternativePath) && (
        <div className="legend-group">
          <span className="legend-group-label">Routes</span>
          {showOptimalPath && (
            <span className="legend-item">
              <span className="legend-color legend-optimal-route" />
              p* · Optimal
            </span>
          )}
          {showAlternativePath && (
            <span className="legend-item">
              <span className="legend-color legend-route" />
              {alternativePathLabel}
            </span>
          )}
          {showOptimalPath && showAlternativePath && (
            <span className="legend-item">
              <span className="legend-color legend-shared-route" />
              Shared section
            </span>
          )}
        </div>
      )}
      <div className="legend-group">
        <span className="legend-group-label">Endpoints</span>
        <span className="legend-item">
          <span className="legend-color legend-start" />
          Start
        </span>
        <span className="legend-item">
          <span className="legend-color legend-goal" />
          Goal
        </span>
      </div>
      <div className="legend-group">
        <span className="legend-group-label">Terrain</span>
        {Object.entries(mapData.speeds ?? {})
          .filter(
            ([name]) =>
              mapData.isp_model !== "BRANDAO" ||
              name === "GRASS" ||
              name === "FOREST",
          )
          .map(([name, speed]) => (
            <span className="legend-item" key={name}>
              <span
                className="legend-color"
                style={{
                  backgroundColor: mapData.terrain_colors?.[name] ?? "#808080",
                }}
              />
              {mapData.isp_model === "BRANDAO" && name === "GRASS"
                ? "Fast"
                : mapData.isp_model === "BRANDAO" && name === "FOREST"
                  ? "Slow"
                  : name.toLowerCase().replaceAll("_", " ")}{" "}
              (
              {Number(speed).toLocaleString("en-US", {
                maximumSignificantDigits: 6,
              })}{" "}
              m/s)
            </span>
          ))}
        <span className="legend-item">
          <span
            className={
              mapData.isp_model === "BRANDAO"
                ? "legend-color"
                : "legend-color legend-obstacle"
            }
            style={
              mapData.isp_model === "BRANDAO"
                ? { backgroundColor: "#282828" }
                : undefined
            }
          />
          {mapData.isp_model === "BRANDAO" ? "Blocked" : "Obstacle"}
        </span>
      </div>
      {hasChanges && (
        <div className="legend-group">
          <span className="legend-group-label">Changes</span>
          {terrainCount > 0 && (
            <span className="legend-item">
              <span className="legend-color legend-change-cell legend-change-terrain" />
              Terrain changed ({terrainCount})
            </span>
          )}
          {openingCount > 0 && (
            <span className="legend-item">
              <span className="legend-color legend-change-cell legend-change-cell-opening" />
              Cells made traversable ({openingCount})
            </span>
          )}
          {slopeCount > 0 && (
            <span className="legend-item">
              <svg
                className="legend-speed-arrow"
                viewBox="0 0 20 14"
                aria-hidden="true"
                style={{ color: "var(--map-change-slope)" }}
              >
                <path
                  className="legend-speed-outline"
                  d="M3 7h14M10 3v8M14 4l3 3-3 3"
                />
                <path
                  className="legend-speed-color"
                  d="M3 7h14M10 3v8M14 4l3 3-3 3"
                />
              </svg>
              Directed slopes adjusted ({slopeCount})
            </span>
          )}
          {[
            {
              count: environmentalCount,
              label: "Environmental speed limit removed",
              color: "var(--map-change-environmental-speed)",
              path: "M2 7h15M11 3l6 4-6 4",
            },
            {
              count: capabilityCount,
              label: "Hypothetical robot capability",
              color: "var(--map-change-robot-capability)",
              path: "M2 7h15M11 3l6 4-6 4M6 3l6 4-6 4",
            },
          ]
            .filter(({ count }) => count > 0)
            .map(({ count, label, color, path }) => (
              <span className="legend-item" key={label}>
                <svg
                  className="legend-speed-arrow"
                  viewBox="0 0 20 14"
                  aria-hidden="true"
                  style={{ color }}
                >
                  <path className="legend-speed-outline" d={path} />
                  <path className="legend-speed-color" d={path} />
                </svg>
                {label} ({count} directed edges)
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
