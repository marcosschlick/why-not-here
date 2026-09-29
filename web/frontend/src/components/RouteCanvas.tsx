import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { MapData } from "../types";

interface RouteCanvasProps {
  mapData: MapData;
  userPath: [number, number][];
  onPathChange: (path: [number, number][]) => void;
  onSolve: () => void;
  isSolving: boolean;
  onCancel?: () => void;
  solveButtonText?: string;
  onPrevMap?: () => void;
  batchStepper?: React.ReactNode;
}

type Rgb = [number, number, number];

function rgba([red, green, blue]: Rgb, alpha = 1): string {
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

const TERRAIN_RGB: Record<string, Rgb> = {
  COMPACTED_SOIL: [158, 107, 71],
  GRASS: [46, 148, 56],
  DRY_VEGETATION: [191, 194, 51],
  SAND: [250, 209, 66],
  MUD: [92, 56, 41],
  WATER_RIVER: [5, 133, 230],
};

const OBSTACLE_RGB: Rgb = [20, 20, 23];
const START_RGB: Rgb = [0, 176, 255];
const START_EDGE_RGB: Rgb = [0, 51, 102];
const GOAL_RGB: Rgb = [255, 215, 0];
const GOAL_EDGE_RGB: Rgb = [102, 68, 0];
const USER_PATH_RGB: Rgb = [255, 23, 68];
const GRID_RGB: Rgb = [255, 255, 255];

function connectPoints(
  p1: [number, number],
  p2: [number, number],
  connectivity: number,
): [number, number][] {
  let [r, c] = p1;
  const [rEnd, cEnd] = p2;
  const pts: [number, number][] = [];
  let safety = 0;

  while ((r !== rEnd || c !== cEnd) && safety < 10000) {
    safety++;
    pts.push([r, c]);
    const dr = rEnd > r ? 1 : rEnd < r ? -1 : 0;
    const dc = cEnd > c ? 1 : cEnd < c ? -1 : 0;
    if (connectivity === 4 && dr !== 0 && dc !== 0) {
      r += dr;
    } else {
      r += dr;
      c += dc;
    }
  }
  pts.push([rEnd, cEnd]);
  return pts;
}

export function RouteCanvas({
  mapData,
  userPath,
  onPathChange,
  onSolve,
  isSolving,
  onCancel,
  solveButtonText,
  onPrevMap,
  batchStepper,
}: RouteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [hoveredCell, setHoveredCell] = useState<[number, number] | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [cellSize, setCellSize] = useState<number>(10);

  const { h, w, start, goal, connectivity, terrain, elevation, obstacle } =
    mapData;

  const isConnectedToGoal =
    userPath.length > 0 &&
    userPath[userPath.length - 1][0] === goal[0] &&
    userPath[userPath.length - 1][1] === goal[1];

  const updateCellSize = useCallback(() => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const maxAvailableWidth = Math.max(280, containerWidth - 48);
    const maxAvailableHeight = 460;
    const sizeW = Math.floor(maxAvailableWidth / w);
    const sizeH = Math.floor(maxAvailableHeight / h);
    const computedSize = Math.max(4, Math.min(24, Math.min(sizeW, sizeH)));
    setCellSize(computedSize);
  }, [w, h]);

  useEffect(() => {
    updateCellSize();
    window.addEventListener("resize", updateCellSize);
    return () => window.removeEventListener("resize", updateCellSize);
  }, [updateCellSize]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          setZoomLevel((z) => Math.min(3.0, +(z + 0.25).toFixed(2)));
        } else if (e.deltaY > 0) {
          setZoomLevel((z) => Math.max(1.0, +(z - 0.25).toFixed(2)));
        }
      }
    }

    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const effectiveCellSize = cellSize * zoomLevel;
    canvas.width = Math.round(w * effectiveCellSize);
    canvas.height = Math.round(h * effectiveCellSize);

    let minElev = Infinity;
    let maxElev = -Infinity;
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        const val = elevation[i]?.[j] ?? 0;
        if (val < minElev) minElev = val;
        if (val > maxElev) maxElev = val;
      }
    }
    const elevRange = maxElev - minElev;

    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        const x = Math.round(j * effectiveCellSize);
        const y = Math.round(i * effectiveCellSize);
        const cellW = Math.round((j + 1) * effectiveCellSize) - x;
        const cellH = Math.round((i + 1) * effectiveCellSize) - y;

        const isObs = obstacle[i]?.[j] === 1;
        const tName = terrain[i]?.[j] || "GRASS";
        const cellElev = elevation[i]?.[j] ?? 0;

        const factor =
          elevRange > 0.0
            ? 0.82 + 0.36 * ((cellElev - minElev) / elevRange)
            : 1.0;

        if (tName === "WATER_RIVER") {
          const [baseR, baseG, baseB] = TERRAIN_RGB["WATER_RIVER"];
          const r = Math.min(255, Math.max(0, Math.round(baseR * factor)));
          const g = Math.min(255, Math.max(0, Math.round(baseG * factor)));
          const b = Math.min(255, Math.max(0, Math.round(baseB * factor)));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, cellW, cellH);
        } else if (isObs) {
          ctx.fillStyle = rgba(OBSTACLE_RGB);
          ctx.fillRect(x, y, cellW, cellH);
          if (effectiveCellSize >= 8) {
            ctx.fillStyle = rgba(OBSTACLE_RGB, 0.34);
            ctx.fillRect(
              x + 1,
              y + 1,
              Math.max(1, cellW - 2),
              Math.max(1, cellH - 2),
            );
          }
        } else {
          const [baseR, baseG, baseB] = TERRAIN_RGB[tName] || [128, 128, 128];
          const r = Math.min(255, Math.max(0, Math.round(baseR * factor)));
          const g = Math.min(255, Math.max(0, Math.round(baseG * factor)));
          const b = Math.min(255, Math.max(0, Math.round(baseB * factor)));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, cellW, cellH);
        }

        if (effectiveCellSize >= 10) {
          ctx.strokeStyle = rgba(GRID_RGB, 0.16);
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, cellW, cellH);
        }
      }
    }

    if (userPath.length > 0) {
      ctx.beginPath();
      for (let idx = 0; idx < userPath.length; idx++) {
        const [r, c] = userPath[idx];
        const cx = c * effectiveCellSize + effectiveCellSize / 2;
        const cy = r * effectiveCellSize + effectiveCellSize / 2;
        if (idx === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.strokeStyle = rgba(USER_PATH_RGB, 0.35);
      ctx.lineWidth = Math.max(3, effectiveCellSize * 0.7);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      ctx.beginPath();
      for (let idx = 0; idx < userPath.length; idx++) {
        const [r, c] = userPath[idx];
        const cx = c * effectiveCellSize + effectiveCellSize / 2;
        const cy = r * effectiveCellSize + effectiveCellSize / 2;
        if (idx === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.strokeStyle = rgba(USER_PATH_RGB);
      ctx.lineWidth = Math.max(2, effectiveCellSize * 0.4);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      ctx.fillStyle = rgba(USER_PATH_RGB);
      for (const [r, c] of userPath) {
        const cx = c * effectiveCellSize + effectiveCellSize / 2;
        const cy = r * effectiveCellSize + effectiveCellSize / 2;
        ctx.beginPath();
        ctx.arc(
          cx,
          cy,
          Math.max(1.5, effectiveCellSize * 0.22),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    const sx = start[1] * effectiveCellSize + effectiveCellSize / 2;
    const sy = start[0] * effectiveCellSize + effectiveCellSize / 2;
    const sRadius = Math.max(6, effectiveCellSize * 0.85);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.beginPath();
    ctx.moveTo(0, -sRadius);
    ctx.lineTo(sRadius, 0);
    ctx.lineTo(0, sRadius);
    ctx.lineTo(-sRadius, 0);
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

    const gx = goal[1] * effectiveCellSize + effectiveCellSize / 2;
    const gy = goal[0] * effectiveCellSize + effectiveCellSize / 2;
    const gRadius = Math.max(6, effectiveCellSize * 0.85);

    ctx.save();
    ctx.beginPath();
    ctx.arc(gx, gy, gRadius, 0, Math.PI * 2);
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
      ctx.fillText("G", gx, gy);
    }
    ctx.restore();

    if (hoveredCell) {
      const [hr, hc] = hoveredCell;
      if (hr >= 0 && hr < h && hc >= 0 && hc < w) {
        ctx.strokeStyle = rgba(START_RGB);
        ctx.lineWidth = 2;
        const hx = Math.round(hc * effectiveCellSize);
        const hy = Math.round(hr * effectiveCellSize);
        const hw = Math.round((hc + 1) * effectiveCellSize) - hx;
        const hh = Math.round((hr + 1) * effectiveCellSize) - hy;
        ctx.strokeRect(hx, hy, hw, hh);
      }
    }
  }, [
    h,
    w,
    cellSize,
    zoomLevel,
    elevation,
    terrain,
    obstacle,
    start,
    goal,
    userPath,
    hoveredCell,
  ]);

  function getCellFromCoordinates(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): [number, number] | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const c = Math.floor(x / zoomLevel / cellSize);
    const r = Math.floor(y / zoomLevel / cellSize);

    if (r >= 0 && r < h && c >= 0 && c < w) {
      return [r, c];
    }
    return null;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || isConnectedToGoal) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    const cell = getCellFromCoordinates(event);
    if (!cell) return;

    setIsDrawing(true);

    if (userPath.length === 0) {
      const connected = connectPoints(start, cell, connectivity);
      const goalIdx = connected.findIndex(
        (p) => p[0] === goal[0] && p[1] === goal[1],
      );
      if (goalIdx >= 0) {
        onPathChange(connected.slice(0, goalIdx + 1));
        setIsDrawing(false);
        return;
      }
      onPathChange(connected);
    } else {
      const lastPoint = userPath[userPath.length - 1];
      const existingIdx = userPath.findIndex(
        (p) => p[0] === cell[0] && p[1] === cell[1],
      );
      if (existingIdx >= 0) {
        onPathChange(userPath.slice(0, existingIdx + 1));
      } else {
        const extension = connectPoints(lastPoint, cell, connectivity);
        const goalIdx = extension.findIndex(
          (p) => p[0] === goal[0] && p[1] === goal[1],
        );
        if (goalIdx >= 0) {
          const combined = [...userPath, ...extension.slice(1, goalIdx + 1)];
          onPathChange(combined);
          setIsDrawing(false);
          return;
        }
        const combined = [...userPath, ...extension.slice(1)];
        onPathChange(combined);
      }
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const cell = getCellFromCoordinates(event);
    setHoveredCell(cell);

    if (!isDrawing || !cell || isConnectedToGoal) return;

    if (userPath.length === 0) {
      const connected = connectPoints(start, cell, connectivity);
      const goalIdx = connected.findIndex(
        (p) => p[0] === goal[0] && p[1] === goal[1],
      );
      if (goalIdx >= 0) {
        onPathChange(connected.slice(0, goalIdx + 1));
        setIsDrawing(false);
        return;
      }
      onPathChange(connected);
      return;
    }

    const lastPoint = userPath[userPath.length - 1];
    if (lastPoint[0] === cell[0] && lastPoint[1] === cell[1]) {
      return;
    }

    const extension = connectPoints(lastPoint, cell, connectivity);
    const goalIdx = extension.findIndex(
      (p) => p[0] === goal[0] && p[1] === goal[1],
    );
    if (goalIdx >= 0) {
      const combined = [...userPath, ...extension.slice(1, goalIdx + 1)];
      onPathChange(combined);
      setIsDrawing(false);
      return;
    }

    const combined = [...userPath, ...extension.slice(1)];
    onPathChange(combined);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // ignore
    }
    setIsDrawing(false);
  }

  function handleAutoRoute() {
    if (mapData.auto_path && mapData.auto_path.length > 0) {
      onPathChange(mapData.auto_path);
      setIsDrawing(false);
    }
  }

  function handleConnectGoal() {
    if (isConnectedToGoal) return;
    const lastPoint =
      userPath.length > 0 ? userPath[userPath.length - 1] : start;
    const extension = connectPoints(lastPoint, goal, connectivity);
    const combined =
      userPath.length > 0 ? [...userPath, ...extension.slice(1)] : extension;
    onPathChange(combined);
    setIsDrawing(false);
  }

  function handleClear() {
    onPathChange([start]);
  }

  function handleUndo() {
    if (userPath.length <= 1) {
      onPathChange([start]);
    } else {
      const newLength = Math.max(1, userPath.length - 4);
      onPathChange(userPath.slice(0, newLength));
    }
  }

  const hoveredInfo = hoveredCell ? (
    <span>
      Cell{" "}
      <strong>
        [{hoveredCell[0]}, {hoveredCell[1]}]
      </strong>{" "}
      &bull; Terrain{" "}
      <strong>{terrain[hoveredCell[0]]?.[hoveredCell[1]] || "-"}</strong> &bull;
      Elevation{" "}
      <strong>
        {elevation[hoveredCell[0]]?.[hoveredCell[1]]?.toFixed(1) ?? "-"}m
      </strong>{" "}
      &bull; Status{" "}
      {obstacle[hoveredCell[0]]?.[hoveredCell[1]] === 1 ? (
        <strong className="cell-status cell-status-obstacle">Obstacle</strong>
      ) : (
        <strong className="cell-status cell-status-free">Free</strong>
      )}
    </span>
  ) : (
    <span>Hover over grid or drag pointer to interact</span>
  );

  return (
    <section className="route-canvas-section" ref={containerRef}>
      {batchStepper}
      <div className="canvas-header-card">
        <div className="canvas-title-group">
          <h2>2. Route Definition</h2>
          <p className="subtitle">
            Define alternative trajectory from Start (S) to Goal (G).
          </p>
        </div>

        <div className="canvas-actions-bar">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleAutoRoute}
            disabled={isSolving}
          >
            Automatic Route
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleConnectGoal}
            disabled={isSolving || isConnectedToGoal}
          >
            Connect to Goal
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleUndo}
            disabled={isSolving || userPath.length <= 1}
          >
            Undo
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleClear}
            disabled={isSolving}
          >
            Clear
          </button>

          <div className="zoom-controls-bar">
            <span className="zoom-label">Zoom</span>
            <button
              type="button"
              className="btn-zoom"
              onClick={() =>
                setZoomLevel((z) => Math.max(1.0, +(z - 0.25).toFixed(2)))
              }
              disabled={zoomLevel <= 1.0}
              title="Zoom Out (-0.25x)"
            >
              &minus;
            </button>
            <span className="zoom-value">{Math.round(zoomLevel * 100)}%</span>
            <button
              type="button"
              className="btn-zoom"
              onClick={() =>
                setZoomLevel((z) => Math.min(3.0, +(z + 0.25).toFixed(2)))
              }
              disabled={zoomLevel >= 3.0}
              title="Zoom In (+0.25x)"
            >
              +
            </button>
            <button
              type="button"
              className="btn-zoom btn-zoom-reset"
              onClick={() => setZoomLevel(1.0)}
              disabled={zoomLevel === 1.0}
              title="Reset Zoom to 100%"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="canvas-status-banner">
        <div className="status-badge-container">
          <span className="node-marker start-badge">
            S: [{start[0]}, {start[1]}]
          </span>
          <span className="node-marker goal-badge">
            G: [{goal[0]}, {goal[1]}]
          </span>

          {isConnectedToGoal ? (
            <span className="badge badge-success">
              Route connected to Goal ({userPath.length} steps) &bull; Locked
              (click Clear to redraw)
            </span>
          ) : (
            <span className="badge badge-warning">
              Pending route ({userPath.length} steps) &bull; Connect to Goal [
              {goal[0]}, {goal[1]}]
            </span>
          )}
        </div>

        <div className="solve-action-group">
          {onPrevMap && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onPrevMap}
              disabled={isSolving}
            >
              &larr; Prev Map
            </button>
          )}

          {onCancel && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onCancel}
              disabled={isSolving}
            >
              Back
            </button>
          )}

          <button
            type="button"
            className="btn btn-vibrant btn-large"
            onClick={onSolve}
            disabled={isSolving || !isConnectedToGoal}
          >
            {isSolving ? "Solving ISP..." : solveButtonText || "3. Solve ISP"}
          </button>
        </div>
      </div>

      <div className="canvas-wrapper" ref={wrapperRef}>
        <canvas
          ref={canvasRef}
          className={`interactive-canvas ${
            isConnectedToGoal ? "is-locked" : ""
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => {
            if (!isDrawing) {
              setHoveredCell(null);
            }
          }}
        />
      </div>

      <div className="canvas-footer-info">
        <div className="cell-inspector">{hoveredInfo}</div>
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
            <span className="legend-item">
              <span className="legend-color legend-route" />
              Alternative Route (p&apos;)
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
