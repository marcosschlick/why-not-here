import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { MapData } from "../types";
import {
  connectPoints,
  constrainDirection,
  type GridPoint,
} from "../utils/geometry";
import { useMapCanvasFit } from "../utils/useMapCanvasFit";
import { TacticalMapCanvas, TacticalMapLegend } from "./TacticalMapCanvas";

interface RouteCanvasProps {
  mapData: MapData;
  userPath: GridPoint[];
  onPathChange: (path: GridPoint[]) => void;
  onSolve: () => void;
  isSolving: boolean;
  onCancel?: () => void;
  solveButtonText?: string;
  busyButtonText?: string;
  onPrevMap?: () => void;
  batchStepper?: React.ReactNode;
}

export function RouteCanvas({
  mapData,
  userPath,
  onPathChange,
  onSolve,
  isSolving,
  onCancel,
  solveButtonText,
  busyButtonText,
  onPrevMap,
  batchStepper,
}: RouteCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [hoveredCell, setHoveredCell] = useState<GridPoint | null>(null);
  const [isShiftDown, setIsShiftDown] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [zoomMapData, setZoomMapData] = useState(mapData);
  const [undoDepth, setUndoDepth] = useState<number>(0);
  const [showOptimalRoute, setShowOptimalRoute] = useState<boolean>(false);
  const [dragOrigin, setDragOrigin] = useState<GridPoint | null>(null);

  const strokeBasePathRef = useRef<GridPoint[] | null>(null);
  const dragOriginRef = useRef<GridPoint | null>(null);
  const rawHoveredCellRef = useRef<GridPoint | null>(null);
  const undoHistoryRef = useRef<GridPoint[][]>([]);
  const mapDataRef = useRef(mapData);

  const { h, w, start, goal, connectivity, terrain, elevation, obstacle } =
    mapData;
  const cellSize = useMapCanvasFit(wrapperRef, h, w);

  if (zoomMapData !== mapData) {
    setZoomMapData(mapData);
    setZoomLevel(1.0);
  }

  const isConnectedToGoal =
    userPath.length > 0 &&
    userPath[userPath.length - 1][0] === goal[0] &&
    userPath[userPath.length - 1][1] === goal[1];

  useEffect(() => {
    function updateHoverWithShift(shiftState: boolean) {
      const raw = rawHoveredCellRef.current;
      if (!raw) return;
      if (shiftState) {
        const origin =
          dragOriginRef.current ??
          (userPath.length > 0 ? userPath[userPath.length - 1] : start);
        setHoveredCell(constrainDirection(origin, raw, connectivity, h, w));
      } else {
        setHoveredCell(raw);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Shift") {
        setIsShiftDown(true);
        updateHoverWithShift(true);
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "Shift") {
        setIsShiftDown(false);
        updateHoverWithShift(false);
      }
    }

    function handleBlur() {
      setIsShiftDown(false);
      updateHoverWithShift(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [userPath, start, connectivity, h, w]);

  useLayoutEffect(() => {
    if (mapDataRef.current !== mapData) {
      undoHistoryRef.current = [];
      setUndoDepth(0);
      mapDataRef.current = mapData;
    }
  }, [mapData]);

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

  function getCellFromCoordinates(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): [number, number] | null {
    const rect = event.currentTarget.getBoundingClientRect();
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
    } catch (_err) {
      void _err;
    }
    const rawCell = getCellFromCoordinates(event);
    if (!rawCell) return;

    setIsDrawing(true);
    rawHoveredCellRef.current = rawCell;

    const isShift = event.shiftKey || isShiftDown;
    const currentOrigin =
      userPath.length > 0 ? userPath[userPath.length - 1] : start;

    dragOriginRef.current = currentOrigin;
    setDragOrigin(currentOrigin);
    strokeBasePathRef.current = [...userPath];

    const cell = isShift
      ? constrainDirection(currentOrigin, rawCell, connectivity, h, w)
      : rawCell;

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
      const existingIdx = userPath.findIndex(
        (p) => p[0] === cell[0] && p[1] === cell[1],
      );
      if (existingIdx >= 0 && !isShift) {
        onPathChange(userPath.slice(0, existingIdx + 1));
      } else {
        const extension = connectPoints(currentOrigin, cell, connectivity);
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
    const rawCell = getCellFromCoordinates(event);
    const isShift = event.shiftKey || isShiftDown;
    if (event.shiftKey !== isShiftDown) {
      setIsShiftDown(event.shiftKey);
    }

    if (!rawCell) {
      rawHoveredCellRef.current = null;
      setHoveredCell(null);
      return;
    }

    rawHoveredCellRef.current = rawCell;

    const currentOrigin =
      dragOriginRef.current ??
      (userPath.length > 0 ? userPath[userPath.length - 1] : start);

    const cell = isShift
      ? constrainDirection(currentOrigin, rawCell, connectivity, h, w)
      : rawCell;

    setHoveredCell(cell);

    if (!isDrawing || isConnectedToGoal) return;

    if (isShift) {
      const basePath = strokeBasePathRef.current ?? userPath;
      const origin =
        dragOriginRef.current ??
        (basePath.length > 0 ? basePath[basePath.length - 1] : start);
      const extension = connectPoints(origin, cell, connectivity);
      const goalIdx = extension.findIndex(
        (p) => p[0] === goal[0] && p[1] === goal[1],
      );
      if (goalIdx >= 0) {
        const combined =
          basePath.length === 0
            ? extension.slice(0, goalIdx + 1)
            : [...basePath, ...extension.slice(1, goalIdx + 1)];
        onPathChange(combined);
        setIsDrawing(false);
        return;
      }
      const combined =
        basePath.length === 0
          ? extension
          : [...basePath, ...extension.slice(1)];
      onPathChange(combined);
    } else {
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
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch (_err) {
      void _err;
    }
    const previousPath = strokeBasePathRef.current;
    if (
      previousPath &&
      (previousPath.length !== userPath.length ||
        previousPath.some(
          ([row, col], index) =>
            userPath[index]?.[0] !== row || userPath[index]?.[1] !== col,
        ))
    ) {
      undoHistoryRef.current = [...undoHistoryRef.current, previousPath];
      setUndoDepth(undoHistoryRef.current.length);
    }
    setIsDrawing(false);
    strokeBasePathRef.current = null;
    dragOriginRef.current = null;
    setDragOrigin(null);
  }

  function handleAutoRoute() {
    if (mapData.auto_path && mapData.auto_path.length > 0) {
      undoHistoryRef.current = [];
      setUndoDepth(0);
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
    undoHistoryRef.current = [];
    setUndoDepth(0);
    onPathChange(combined);
    setIsDrawing(false);
  }

  function handleClear() {
    undoHistoryRef.current = [];
    setUndoDepth(0);
    onPathChange([start]);
  }

  function handleUndo() {
    const previousPath = undoHistoryRef.current.pop();
    if (!previousPath) return;
    setUndoDepth(undoHistoryRef.current.length);
    onPathChange(previousPath);
  }

  const hoveredTerrain = hoveredCell
    ? terrain[hoveredCell[0]]?.[hoveredCell[1]] || "-"
    : "-";
  const hoveredTerrainSpeed = mapData.config.TERRAINS?.[hoveredTerrain];
  const hoveredTerrainBlocked =
    hoveredTerrain === "WATER_RIVER" ||
    (hoveredTerrainSpeed !== undefined && hoveredTerrainSpeed <= 0);

  const hoveredInfo = hoveredCell ? (
    <span>
      Cell{" "}
      <strong>
        [{hoveredCell[0]}, {hoveredCell[1]}]
      </strong>{" "}
      {isShiftDown && (
        <strong className="shift-indicator">
          ({connectivity === 4 ? "Orthogonal Lock" : "45° / Orthogonal Lock"})
        </strong>
      )}{" "}
      &bull; Terrain{" "}
      <strong>{hoveredTerrain}</strong> &bull;
      Elevation{" "}
      <strong>
        {elevation[hoveredCell[0]]?.[hoveredCell[1]]?.toFixed(1) ?? "-"}m
      </strong>{" "}
      &bull; Status{" "}
      {hoveredTerrainBlocked ? (
        <strong className="cell-status cell-status-impassable">
          Impassable terrain
        </strong>
      ) : obstacle[hoveredCell[0]]?.[hoveredCell[1]] === 1 ? (
        <strong className="cell-status cell-status-obstacle">Obstacle</strong>
      ) : (
        <strong className="cell-status cell-status-free">Free</strong>
      )}
    </span>
  ) : (
    <span>
      Hover over grid or drag pointer to interact (hold Shift for
      straight/diagonal lines)
    </span>
  );

  return (
    <section className="route-canvas-section" ref={containerRef}>
      {batchStepper}
      <div className="canvas-header-card">
        <div className="canvas-title-group">
          <h2>Route Definition</h2>
          <p className="subtitle">
            Define alternative trajectory from Start (S) to Goal (G).
          </p>
        </div>

        <div className="canvas-actions-bar">
          <div className="canvas-control-group" role="group" aria-label="Route editing">
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
              disabled={isSolving || undoDepth === 0}
            >
              Undo Last Point
            </button>
            <button
              type="button"
              className="btn btn-danger-ghost"
              onClick={handleClear}
              disabled={isSolving}
            >
              Clear
            </button>
          </div>

          <div className="canvas-control-group canvas-view-group" role="group" aria-label="Map display">
            <button
              type="button"
              className={`btn ${showOptimalRoute ? "btn-secondary active" : "btn-ghost"}`}
              onClick={() => setShowOptimalRoute((prev) => !prev)}
              disabled={
                isSolving ||
                !mapData.optimal_path ||
                mapData.optimal_path.length === 0
              }
              title={
                showOptimalRoute
                  ? "Hide initial optimal path (p*)"
                  : "Show initial optimal path (p*)"
              }
            >
              {showOptimalRoute ? "Hide Optimal Route" : "Show Optimal Route"}
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
                className="btn-zoom btn-zoom-fit"
                onClick={() => setZoomLevel(1.0)}
                disabled={zoomLevel === 1.0}
                title="Fit map to view"
              >
                Fit
              </button>
            </div>
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

          {isShiftDown && (
            <span className="node-marker shift-badge">
              Shift:{" "}
              {connectivity === 4 ? "Orthogonal Snap" : "45° / Orthogonal Snap"}
            </span>
          )}

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
            {isSolving
              ? busyButtonText || "Solving ISP..."
              : solveButtonText || "Solve ISP"}
          </button>
        </div>
      </div>

      <div className="canvas-wrapper" ref={wrapperRef}>
        <TacticalMapCanvas
          mapData={mapData}
          userPath={userPath}
          optimalPath={showOptimalRoute ? mapData.optimal_path : undefined}
          cellSize={cellSize}
          zoomLevel={zoomLevel}
          hoveredCell={hoveredCell}
          isShiftDown={isShiftDown}
          dragOrigin={dragOrigin}
          isConnectedToGoal={isConnectedToGoal}
          interactive
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            rawHoveredCellRef.current = null;
            if (!isDrawing) {
              setHoveredCell(null);
            }
          }}
        />
      </div>

      <div className="canvas-footer-info">
        <div className="cell-inspector">{hoveredInfo}</div>
        <TacticalMapLegend
          showOptimalPath={
            showOptimalRoute &&
            Boolean(mapData.optimal_path && mapData.optimal_path.length > 0)
          }
        />
      </div>
    </section>
  );
}
