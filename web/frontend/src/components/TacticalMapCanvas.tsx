import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { MapData, SemanticModificationsData } from "../types";
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
}

type Rgb = [number, number, number];

const EMPTY_PATH: GridPoint[] = [];

function rgba([red, green, blue]: Rgb, alpha = 1): string {
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function shadedColor([red, green, blue]: Rgb, factor: number): string {
  const channels = [red, green, blue].map((channel) =>
    Math.min(255, Math.max(0, Math.round(channel * factor))),
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

const OBSTACLE_RGB: Rgb = [20, 20, 23];
const START_RGB: Rgb = [0, 176, 255];
const START_EDGE_RGB: Rgb = [0, 51, 102];
const GOAL_RGB: Rgb = [255, 215, 0];
const GOAL_EDGE_RGB: Rgb = [102, 68, 0];
const USER_PATH_RGB: Rgb = [255, 23, 68];
const OPTIMAL_PATH_RGB: Rgb = [0, 230, 118];
const ISP_TERRAIN_RGB: Rgb = [0, 229, 255];
const ISP_OBSTACLE_RGB: Rgb = [255, 23, 68];
const ISP_SLOPE_RGB: Rgb = [170, 0, 255];
const GRID_RGB: Rgb = [255, 255, 255];

function drawPath(
  ctx: CanvasRenderingContext2D,
  path: GridPoint[],
  color: Rgb,
  cellSize: number,
  alpha = 1,
  lineWidth = Math.max(2, cellSize * 0.4),
  dashed = false,
) {
  if (path.length === 0) return;

  ctx.beginPath();
  path.forEach(([row, col], index) => {
    const x = col * cellSize + cellSize / 2;
    const y = row * cellSize + cellSize / 2;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(
    dashed ? [Math.max(3, cellSize * 0.6), Math.max(2, cellSize * 0.35)] : [],
  );
  ctx.stroke();
  ctx.setLineDash([]);

  if (cellSize >= 8) {
    ctx.fillStyle = rgba(color, alpha);
    for (const [row, col] of path) {
      ctx.beginPath();
      ctx.arc(
        col * cellSize + cellSize / 2,
        row * cellSize + cellSize / 2,
        Math.max(1.5, cellSize * 0.16),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
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
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const spacing = Math.max(4, Math.floor(Math.min(width, height) / 2));
  for (let offset = -height; offset < width; offset += spacing) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y + height);
    ctx.lineTo(x + offset + height, y);
    ctx.stroke();
  }
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
}: TacticalMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [deviceScale] = useState<number>(() =>
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  );
  const { h, w, start, goal, terrain, elevation, obstacle } = mapData;
  const effectiveCellSize = cellSize * zoomLevel;
  const logicalWidth = Math.max(1, Math.round(w * effectiveCellSize));
  const logicalHeight = Math.max(1, Math.round(h * effectiveCellSize));
  const renderScale = Math.min(
    deviceScale,
    4096 / Math.max(1, logicalWidth, logicalHeight),
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pixelWidth = Math.round(logicalWidth * renderScale);
    const pixelHeight = Math.round(logicalHeight * renderScale);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (canvas.style.width !== `${logicalWidth}px`) {
      canvas.style.width = `${logicalWidth}px`;
    }
    if (canvas.style.height !== `${logicalHeight}px`) {
      canvas.style.height = `${logicalHeight}px`;
    }
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);

    let minElev = Infinity;
    let maxElev = -Infinity;
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const value = elevation[row]?.[col] ?? 0;
        if (value < minElev) minElev = value;
        if (value > maxElev) maxElev = value;
      }
    }
    const elevationRange = maxElev - minElev;

    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const x = Math.round(col * effectiveCellSize);
        const y = Math.round(row * effectiveCellSize);
        const width = Math.round((col + 1) * effectiveCellSize) - x;
        const height = Math.round((row + 1) * effectiveCellSize) - y;
        const terrainName =
          terrain[row]?.[col] || mapData.config.DEFAULT_TERRAIN || "GRASS";
        const isObstacle = obstacle[row]?.[col] === 1;
        const cellElevation = elevation[row]?.[col] ?? 0;
        const baseTerrainColor = terrainColor(
          mapData.config.TERRAIN_COLORS?.[terrainName],
        );
        const shade =
          elevationRange > 0
            ? 0.82 + 0.36 * ((cellElevation - minElev) / elevationRange)
            : 1;

        if (terrainName === "WATER_RIVER") {
          ctx.fillStyle = shadedColor(baseTerrainColor, shade);
        } else if (isObstacle) {
          ctx.fillStyle = rgba(OBSTACLE_RGB);
        } else {
          ctx.fillStyle = shadedColor(baseTerrainColor, shade);
        }
        ctx.fillRect(x, y, width, height);

        if (
          isObstacle &&
          terrainName !== "WATER_RIVER" &&
          effectiveCellSize >= 8
        ) {
          drawHatch(ctx, x, y, width, height, "rgba(248,248,248,0.28)");
        }

        if (effectiveCellSize >= 10) {
          ctx.strokeStyle = rgba(GRID_RGB, 0.16);
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, width, height);
        }
      }
    }

    drawPath(
      ctx,
      optimalPath,
      OPTIMAL_PATH_RGB,
      effectiveCellSize,
      0.9,
      Math.max(2, effectiveCellSize * 0.28),
    );
    drawPath(
      ctx,
      userPath,
      USER_PATH_RGB,
      effectiveCellSize,
      0.35,
      Math.max(3, effectiveCellSize * 0.7),
    );
    drawPath(
      ctx,
      userPath,
      USER_PATH_RGB,
      effectiveCellSize,
      1,
      Math.max(2, effectiveCellSize * 0.4),
      true,
    );

    const terrainNodes = modifications?.terrain_nodes ?? [];
    const obstacleNodes = modifications?.obstacle_nodes ?? [];
    const slopeEdges = modifications?.slope_edges ?? [];
    for (const [row, col] of terrainNodes) {
      const x = col * effectiveCellSize;
      const y = row * effectiveCellSize;
      ctx.fillStyle = rgba(ISP_TERRAIN_RGB, 0.38);
      ctx.fillRect(x, y, effectiveCellSize, effectiveCellSize);
      ctx.strokeStyle = rgba(ISP_TERRAIN_RGB);
      ctx.lineWidth = Math.max(2, effectiveCellSize * 0.12);
      ctx.strokeRect(
        x + ctx.lineWidth / 2,
        y + ctx.lineWidth / 2,
        effectiveCellSize - ctx.lineWidth,
        effectiveCellSize - ctx.lineWidth,
      );
    }

    for (const [row, col] of obstacleNodes) {
      const x = col * effectiveCellSize;
      const y = row * effectiveCellSize;
      ctx.fillStyle = rgba(ISP_OBSTACLE_RGB, 0.34);
      ctx.fillRect(x, y, effectiveCellSize, effectiveCellSize);
      drawHatch(
        ctx,
        x,
        y,
        effectiveCellSize,
        effectiveCellSize,
        rgba(ISP_OBSTACLE_RGB, 0.9),
      );
      ctx.strokeStyle = rgba(ISP_OBSTACLE_RGB);
      ctx.lineWidth = Math.max(2, effectiveCellSize * 0.12);
      ctx.strokeRect(
        x + ctx.lineWidth / 2,
        y + ctx.lineWidth / 2,
        effectiveCellSize - ctx.lineWidth,
        effectiveCellSize - ctx.lineWidth,
      );
    }

    for (const [from, to] of slopeEdges) {
      ctx.beginPath();
      ctx.moveTo(
        from[1] * effectiveCellSize + effectiveCellSize / 2,
        from[0] * effectiveCellSize + effectiveCellSize / 2,
      );
      ctx.lineTo(
        to[1] * effectiveCellSize + effectiveCellSize / 2,
        to[0] * effectiveCellSize + effectiveCellSize / 2,
      );
      ctx.strokeStyle = rgba(ISP_SLOPE_RGB);
      ctx.lineWidth = Math.max(2.5, effectiveCellSize * 0.22);
      ctx.lineCap = "round";
      ctx.stroke();
    }

    const startX = start[1] * effectiveCellSize + effectiveCellSize / 2;
    const startY = start[0] * effectiveCellSize + effectiveCellSize / 2;
    const markerRadius = Math.max(6, effectiveCellSize * 0.85);
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
    ctx.lineWidth = 2;
    ctx.stroke();
    if (effectiveCellSize >= 12) {
      ctx.fillStyle = rgba(GRID_RGB);
      ctx.font = `bold ${Math.max(8, effectiveCellSize * 0.6)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("S", 0, 0);
    }
    ctx.restore();

    const goalX = goal[1] * effectiveCellSize + effectiveCellSize / 2;
    const goalY = goal[0] * effectiveCellSize + effectiveCellSize / 2;
    ctx.beginPath();
    ctx.arc(goalX, goalY, markerRadius, 0, Math.PI * 2);
    ctx.fillStyle = rgba(GOAL_RGB);
    ctx.fill();
    ctx.strokeStyle = rgba(GOAL_EDGE_RGB);
    ctx.lineWidth = 2;
    ctx.stroke();
    if (effectiveCellSize >= 12) {
      ctx.fillStyle = rgba(GOAL_EDGE_RGB);
      ctx.font = `bold ${Math.max(8, effectiveCellSize * 0.6)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("G", goalX, goalY);
    }

  }, [
    cellSize,
    deviceScale,
    elevation,
    effectiveCellSize,
    goal,
    h,
    logicalHeight,
    logicalWidth,
    mapData,
    modifications,
    obstacle,
    optimalPath,
    renderScale,
    start,
    terrain,
    userPath,
    w,
    zoomLevel,
  ]);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pixelWidth = Math.round(logicalWidth * renderScale);
    const pixelHeight = Math.round(logicalHeight * renderScale);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (canvas.style.width !== `${logicalWidth}px`) {
      canvas.style.width = `${logicalWidth}px`;
    }
    if (canvas.style.height !== `${logicalHeight}px`) {
      canvas.style.height = `${logicalHeight}px`;
    }
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    if (!hoveredCell) return;
    const [row, col] = hoveredCell;
    if (row < 0 || row >= h || col < 0 || col >= w) return;

    const x = Math.round(col * effectiveCellSize);
    const y = Math.round(row * effectiveCellSize);
    const width = Math.round((col + 1) * effectiveCellSize) - x;
    const height = Math.round((row + 1) * effectiveCellSize) - y;
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
      className={`tactical-map-canvas ${className}`}
      style={{ width: `${logicalWidth + 2}px`, height: `${logicalHeight + 2}px` }}
    >
      <canvas
        ref={canvasRef}
        className="map-canvas-layer map-canvas-base"
        style={{ width: `${logicalWidth}px`, height: `${logicalHeight}px` }}
        aria-hidden="true"
      />
      <canvas
        ref={overlayRef}
        className={`map-canvas-layer interactive-canvas ${
          interactive ? "" : "is-read-only"
        } ${isConnectedToGoal ? "is-locked" : ""}`}
        style={{ width: `${logicalWidth}px`, height: `${logicalHeight}px` }}
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
  modifications,
  showOptimalPath,
}: {
  modifications?: SemanticModificationsData | null;
  showOptimalPath?: boolean;
}) {
  const hasTerrainChanges = (modifications?.terrain_nodes?.length ?? 0) > 0;
  const hasObstacleChanges = (modifications?.obstacle_nodes?.length ?? 0) > 0;
  const hasSlopeChanges = (modifications?.slope_edges?.length ?? 0) > 0;

  return (
    <div className="canvas-legend" aria-label="Map legend">
      <div className="legend-group">
        <span className="legend-group-label">Terrain</span>
        <span className="legend-item">
          <span className="legend-color legend-compacted-soil" />
          Compacted Soil
        </span>
        <span className="legend-item">
          <span className="legend-color legend-grass" />
          Grass
        </span>
        <span className="legend-item">
          <span className="legend-color legend-dry-vegetation" />
          Dry Vegetation
        </span>
        <span className="legend-item">
          <span className="legend-color legend-sand" />
          Sand
        </span>
        <span className="legend-item">
          <span className="legend-color legend-mud" />
          Mud
        </span>
        <span className="legend-item">
          <span className="legend-color legend-river" />
          River
        </span>
      </div>
      <div className="legend-group">
        <span className="legend-group-label">Markers</span>
        <span className="legend-item">
          <span className="legend-color legend-obstacle" />
          Obstacle
        </span>
        <span className="legend-item">
          <span className="legend-color legend-start" />
          Start (S)
        </span>
        <span className="legend-item">
          <span className="legend-color legend-goal" />
          Goal (G)
        </span>
        {showOptimalPath && (
          <span className="legend-item">
            <span className="legend-color legend-optimal-route" />
            Initial Optimal Route (p*)
          </span>
        )}
        <span className="legend-item">
          <span className="legend-color legend-route" />
          Alternative Route (p&apos;)
        </span>
      </div>
      {(hasTerrainChanges || hasObstacleChanges || hasSlopeChanges) && (
        <div className="legend-group">
          <span className="legend-group-label">ISP Modifications</span>
          {hasTerrainChanges && (
            <span className="legend-item">
              <span className="legend-color legend-isp-terrain" />
              Terrain modified
            </span>
          )}
          {hasObstacleChanges && (
            <span className="legend-item">
              <span className="legend-color legend-isp-obstacle" />
              Obstacle removed
            </span>
          )}
          {hasSlopeChanges && (
            <span className="legend-item">
              <span className="legend-color legend-isp-slope" />
              Slope leveled
            </span>
          )}
        </div>
      )}
    </div>
  );
}
