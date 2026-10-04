import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  LastResult,
  MapData,
  QueueItem,
  SemanticModificationsData,
  SystemConfig,
} from "../types";
import { SolverConfigBadges } from "./SolverConfigBadges";
import { formatReductionMethod } from "../utils/formatters";
import { useMapCanvasFit } from "../utils/useMapCanvasFit";
import { TacticalMapCanvas, TacticalMapLegend } from "./TacticalMapCanvas";
import type { GridPoint } from "../utils/geometry";

interface ResultsViewProps {
  result: LastResult | null;
  mapData?: MapData | null;
  userPath?: GridPoint[];
  artifacts: string[];
  cacheKey: number;
  onNewRun?: () => void;
  batchQueue?: QueueItem[];
  activeBatchIndex?: number;
  onSelectBatchIndex?: (index: number) => void;
  elapsedTime?: number;
  config?: SystemConfig | null;
  mapImageUrl?: string;
}

function ArtifactCard({
  artifactPath,
  cacheKey,
  onSelect,
}: {
  artifactPath: string;
  cacheKey: number;
  onSelect: (path: string) => void;
}) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const cleanPath = artifactPath.split("?")[0];
  const filename = cleanPath.split("/").pop() || cleanPath;
  const titleMap: Record<string, string> = {
    "1_optimal_path.png": "1. Initial Optimal Path (A*)",
    "2_user_path.png": "2. Alternative Candidate Path",
    "3_both_paths.png": "3. Path Comparison",
    "4_isp_modifications.png": "4. Semantic Modifications",
    "5_isp_with_user_path.png": "5. Both Routes with ISP Modifications",
    "map.png": "Procedural Base Map",
  };
  const displayTitle = titleMap[filename] || filename;
  const fullUrl = artifactPath.includes("?")
    ? `${artifactPath}&t=${cacheKey}`
    : `${artifactPath}?t=${cacheKey}`;

  return (
    <div
      className="artifact-item"
      onClick={() => onSelect(artifactPath)}
      title="Click to enlarge"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onSelect(artifactPath);
        }
      }}
    >
      <div className="artifact-item-header">
        <span className="artifact-title">{displayTitle}</span>
      </div>
      <div className="artifact-img-wrap">
        {!isLoaded && !hasError && (
          <div className="artifact-placeholder-loading">
            <div className="spinner-tiny" />
            <span>Rendering artifact...</span>
          </div>
        )}
        {hasError ? (
          <div className="artifact-placeholder-error">
            <span>Artifact unavailable</span>
          </div>
        ) : (
          <img
            src={fullUrl}
            alt={displayTitle}
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            className={`artifact-image ${isLoaded ? "is-loaded" : ""}`}
          />
        )}
      </div>
    </div>
  );
}

export function ResultsView({
  result,
  mapData,
  userPath = [],
  artifacts,
  cacheKey,
  onNewRun,
  batchQueue,
  activeBatchIndex,
  onSelectBatchIndex,
  elapsedTime,
  config,
  mapImageUrl,
}: ResultsViewProps) {
  const [internalBatchIndex, setInternalBatchIndex] = useState<number>(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const mapCanvasContainerRef = useRef<HTMLDivElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [hoveredCell, setHoveredCell] = useState<GridPoint | null>(null);

  const isBatch = Boolean(batchQueue && batchQueue.length > 1);
  const currentBatchIdx =
    activeBatchIndex !== undefined ? activeBatchIndex : internalBatchIndex;

  function handleTabSelect(idx: number) {
    setHoveredCell(null);
    if (onSelectBatchIndex) {
      onSelectBatchIndex(idx);
    } else {
      setInternalBatchIndex(idx);
    }
  }

  const activeBatchItem =
    isBatch && batchQueue ? batchQueue[currentBatchIdx] : null;

  const currentConfig =
    (isBatch && activeBatchItem ? activeBatchItem.config : config) ?? null;

  const currentResult: LastResult | null = isBatch
    ? (activeBatchItem?.result ?? null)
    : result;
  const currentArtifacts: string[] = isBatch
    ? (activeBatchItem?.artifacts ?? [])
    : artifacts;
  const currentMapImageUrl = isBatch
    ? activeBatchItem?.mapData?.map_image_url
    : mapImageUrl;
  const originalMapData = isBatch ? activeBatchItem?.mapData : mapData;
  const modifiedGrid = currentResult?.modified_grid;
  const currentMapData = useMemo(
    () =>
      originalMapData && modifiedGrid
        ? {
            ...originalMapData,
            ...modifiedGrid,
            config: {
              ...originalMapData.config,
              TERRAINS: modifiedGrid.speeds ?? originalMapData.config.TERRAINS,
            },
          }
        : originalMapData,
    [originalMapData, modifiedGrid],
  );
  const currentUserPath = isBatch
    ? (activeBatchItem?.userPath ??
      activeBatchItem?.mapData?.auto_path ??
      (activeBatchItem?.mapData ? [activeBatchItem.mapData.start] : []))
    : userPath;
  const mapHeight = currentMapData?.h;
  const mapWidth = currentMapData?.w;
  const mapCellSize = useMapCanvasFit(
    mapCanvasContainerRef,
    mapHeight,
    mapWidth,
  );
  const [previousMapData, setPreviousMapData] = useState(originalMapData);
  if (previousMapData !== originalMapData) {
    setPreviousMapData(originalMapData);
    setHoveredCell(null);
    setZoomLevel(1.0);
  }
  const tacticalArtifacts = currentArtifacts.filter(
    (artifactPath) => artifactPath.split("?")[0].split("/").pop() !== "map.png",
  );
  const currentStatus = isBatch
    ? activeBatchItem?.status
    : result
      ? "completed"
      : "pending";
  const isSolving = isBatch ? currentStatus === "solving" : false;
  const isPending =
    isBatch &&
    (currentStatus === "pending" ||
      currentStatus === "generating_map" ||
      currentStatus === "awaiting_route");

  useEffect(() => {
    const wrapper = mapCanvasContainerRef.current;
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
  ): GridPoint | null {
    if (!currentMapData) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const c = Math.floor(x / zoomLevel / mapCellSize);
    const r = Math.floor(y / zoomLevel / mapCellSize);

    if (r >= 0 && r < currentMapData.h && c >= 0 && c < currentMapData.w) {
      return [r, c];
    }
    return null;
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const cell = getCellFromCoordinates(event);
    setHoveredCell(cell);
  }

  function handlePointerLeave() {
    setHoveredCell(null);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedImage(null);
      }
    }
    if (selectedImage) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedImage]);

  if (
    !isBatch &&
    !currentResult &&
    tacticalArtifacts.length === 0 &&
    !currentMapImageUrl
  ) {
    return null;
  }

  const isOptimal = currentResult?.solver_status === "OPTIMAL";
  const isFailed = currentResult?.success === false;
  const currentModifications = currentResult?.modifications ?? null;
  const currentModificationCount = currentModifications
    ? currentModifications.terrain +
      currentModifications.obstacle +
      currentModifications.slope +
      (currentModifications.water ?? 0)
    : 0;
  const hasCandidateModifications =
    currentModificationCount > 0 ||
    (currentModifications?.terrain_nodes?.length ?? 0) > 0 ||
    (currentModifications?.obstacle_nodes?.length ?? 0) > 0 ||
    (currentModifications?.slope_edges?.length ?? 0) > 0 ||
    (currentModifications?.water_nodes?.length ?? 0) > 0;
  const isInfeasible = currentResult?.solver_status === "INFEASIBLE";
  const isCandidateSolution =
    isFailed && !isOptimal && hasCandidateModifications;
  const visibleModifications: SemanticModificationsData | null =
    hasCandidateModifications ? currentModifications : null;
  const explanationText = currentResult
    ? currentResult.explanation_text?.trim() ||
      `No detailed explanation was returned for solver status ${currentResult.solver_status}.`
    : null;
  const runtimeDisplay =
    typeof currentResult?.runtime_sec === "number"
      ? `${currentResult.runtime_sec.toFixed(3)}s`
      : "-";

  const origCostDisplay =
    typeof currentResult?.original_optimal_cost === "number"
      ? `${currentResult.original_optimal_cost.toFixed(2)}s`
      : "-";

  const altCostDisplay =
    typeof currentResult?.final_alternative_cost === "number"
      ? isFailed
        ? `${currentResult.final_alternative_cost.toFixed(2)}s (Suboptimal)`
        : `${currentResult.final_alternative_cost.toFixed(2)}s`
      : isFailed
        ? "Impassable (∞)"
        : "-";

  function handleCopy(text: string, key: string) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }

  const isCellTerrainModified = Boolean(
    hoveredCell &&
      visibleModifications?.terrain_nodes?.some(
        ([r, c]) => r === hoveredCell[0] && c === hoveredCell[1],
      ),
  );
  const isCellObstacleModified = Boolean(
    hoveredCell &&
      visibleModifications?.obstacle_nodes?.some(
        ([r, c]) => r === hoveredCell[0] && c === hoveredCell[1],
      ),
  );
  const isCellWaterModified = Boolean(
    hoveredCell &&
      visibleModifications?.water_nodes?.some(
        ([r, c]) => r === hoveredCell[0] && c === hoveredCell[1],
      ),
  );
  const isStart = Boolean(
    hoveredCell &&
      currentMapData &&
      currentMapData.start[0] === hoveredCell[0] &&
      currentMapData.start[1] === hoveredCell[1],
  );
  const isGoal = Boolean(
    hoveredCell &&
      currentMapData &&
      currentMapData.goal[0] === hoveredCell[0] &&
      currentMapData.goal[1] === hoveredCell[1],
  );
  const hoveredTerrain =
    hoveredCell && currentMapData
      ? currentMapData.terrain[hoveredCell[0]]?.[hoveredCell[1]] ?? "-"
      : "-";
  const hoveredTerrainSpeed = currentMapData?.config.TERRAINS?.[hoveredTerrain];
  const hoveredTerrainBlocked =
    !isCellWaterModified &&
    (hoveredTerrain === "WATER_RIVER" ||
      hoveredTerrainSpeed === undefined ||
      hoveredTerrainSpeed <= 0);
  const hoveredObstacleBlocked =
    (currentMapData?.obstacle[hoveredCell?.[0] ?? -1]?.[
      hoveredCell?.[1] ?? -1
    ] ?? 0) !== 0 && !isCellObstacleModified;

  const hoveredInfo = hoveredCell && currentMapData ? (
    <span>
      Cell [{hoveredCell[0]}, {hoveredCell[1]}] &bull; Terrain{" "}
      <strong>
        {hoveredTerrain}
      </strong>
      {isCellTerrainModified && (
        <strong className="mod-badge terrain" style={{ marginLeft: "0.35rem" }}>
          ISP Modified
        </strong>
      )}{" "}
      &bull; Elevation{" "}
      <strong>
        {currentMapData.elevation[hoveredCell[0]]?.[hoveredCell[1]]?.toFixed(1) ??
          "-"}
        m
      </strong>{" "}
      &bull; Status{" "}
      {hoveredObstacleBlocked ? (
        <strong className="cell-status cell-status-obstacle">Obstacle</strong>
      ) : hoveredTerrainBlocked ? (
        <strong className="cell-status cell-status-impassable">
          Impassable terrain
        </strong>
      ) : isCellWaterModified ? (
        <strong className="cell-status cell-status-free">
          Traversable water at base-terrain speed
        </strong>
      ) : (
        <strong className="cell-status cell-status-free">Free</strong>
      )}
      {isCellObstacleModified && (
        <strong
          className="mod-badge obstacle"
          style={{ marginLeft: "0.35rem" }}
        >
          Cleared
        </strong>
      )}
      {isCellWaterModified && (
        <strong className="mod-badge water" style={{ marginLeft: "0.35rem" }}>
          Water override
        </strong>
      )}
      {isStart && (
        <strong
          className="node-marker start-badge"
          style={{ marginLeft: "0.35rem" }}
        >
          Start
        </strong>
      )}
      {isGoal && (
        <strong
          className="node-marker goal-badge"
          style={{ marginLeft: "0.35rem" }}
        >
          Goal
        </strong>
      )}
    </span>
  ) : (
    <span>Hover over grid to inspect cell attributes and modifications</span>
  );

  return (
    <section className="results-container">
      {isBatch && batchQueue && (
        <div className="batch-results-tabs-wrapper">
          <div
            className="batch-results-tabs"
            role="tablist"
            aria-label="Batch Runs"
          >
            {batchQueue.map((item, idx) => {
              const isSelected = idx === currentBatchIdx;
              const isDone = item.status === "completed";
              const isRunning = item.status === "solving";
              const isItemFailed = item.status === "failed";
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`batch-result-tab ${isSelected ? "active" : ""}`}
                  onClick={() => handleTabSelect(idx)}
                >
                  <span className="batch-tab-title">
                    Run {idx + 1}: {item.config.MAP_H}x{item.config.MAP_W}
                  </span>
                  <span className={`batch-tab-badge status-${item.status}`}>
                    {isDone
                      ? "Ready"
                      : isRunning
                        ? "Solving"
                        : isItemFailed
                          ? "Failed"
                          : "Queued"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="results-header">
        <div className="results-title-group">
          <h2>
            {isBatch
              ? `Results & Metrics — Run ${currentBatchIdx + 1} of ${batchQueue!.length}`
              : "Results & Metrics"}
          </h2>
          <span
            className={`status-pill large ${
              isOptimal
                ? "optimal"
                : isFailed
                  ? "failed"
                  : isSolving
                    ? "running"
                    : "neutral"
            }`}
          >
            Solver:{" "}
            {isSolving
              ? "OPTIMIZING..."
              : isPending
                ? "QUEUED"
                : currentResult?.solver_status || "COMPLETED"}
          </span>
        </div>

        {onNewRun && (
          <button
            type="button"
            className="btn btn-secondary results-new-run-action"
            onClick={onNewRun}
          >
            New Run
          </button>
        )}
      </div>

      {currentResult && currentMapData && (
        <section className="results-map-card">
          <div className="results-map-header">
            <div>
              <h3>Interactive Tactical Map</h3>
              <p className="subtitle">
                Alternative route and semantic ISP modifications rendered from
                the active map data.
              </p>
            </div>
            <div className="results-map-controls">
              {isCandidateSolution && (
                <span className="candidate-solution-badge">
                  CANDIDATE SOLUTION (NOT GLOBALLY CERTIFIED)
                </span>
              )}
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

          {!hasCandidateModifications && (
            <p className="results-map-notice">
              {isInfeasible
                ? "No valid modifications could be calculated; the alternative route is shown."
                : isOptimal
                  ? "The certified solution requires no semantic modifications."
                  : "No valid semantic modifications were returned; the alternative route is shown."}
            </p>
          )}
          {currentResult.solver_status === "OPTIMAL_INACCURATE" &&
            currentResult.success && (
              <p className="solver-guarantee-notice">
                Global path validation passed, but OPTIMAL_INACCURATE does not
                certify minimum intervention cardinality.
              </p>
            )}

          <div
            className="canvas-wrapper results-map-canvas-wrapper"
            ref={mapCanvasContainerRef}
          >
            <TacticalMapCanvas
              mapData={currentMapData}
              userPath={currentUserPath}
              optimalPath={currentMapData.optimal_path}
              modifications={visibleModifications}
              cellSize={mapCellSize}
              zoomLevel={zoomLevel}
              hoveredCell={hoveredCell}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
            />
          </div>
          <div className="canvas-footer-info">
            <div className="cell-inspector">{hoveredInfo}</div>
            <TacticalMapLegend
              mapData={currentMapData}
              modifications={visibleModifications}
              showAlternativePath={currentUserPath.length > 0}
              showOptimalPath={Boolean(
                currentMapData.optimal_path &&
                  currentMapData.optimal_path.length > 0,
              )}
            />
          </div>
        </section>
      )}

      {isBatch && !currentResult && (
        <div className="batch-pending-card">
          <div className="batch-pending-spinner" />
          <h3>
            {isSolving
              ? `Solving Run ${currentBatchIdx + 1} of ${batchQueue!.length}...`
              : `Run ${currentBatchIdx + 1} Pending in Queue`}
          </h3>
          {isSolving && activeBatchItem?.config && (
            <div className="loading-params-summary">
              <span className="loading-param-chip">
                Reduction:{" "}
                {formatReductionMethod(
                  activeBatchItem.config.DEFAULT_REDUCTION_METHOD,
                )}
                {activeBatchItem.config.DEFAULT_REDUCTION_METHOD === "BBOX" &&
                  activeBatchItem.config.BBOX_MARGIN !== undefined &&
                  ` (Margin: ${activeBatchItem.config.BBOX_MARGIN})`}
              </span>
              <span className="loading-param-chip">
                Solver:{" "}
                {activeBatchItem.config.USE_INCREMENTAL_SOLVER
                  ? `Incremental MILP${
                      activeBatchItem.config.DEFAULT_REDUCTION_METHOD !== "NONE"
                        ? ` (${activeBatchItem.config.INCREMENTAL_ASTAR_SCOPE === "SUBGRAPH" ? "Subgraph A*" : "Global A*"})`
                        : ""
                    }`
                  : "Monolithic MILP"}
              </span>
              <span className="loading-param-chip">
                Grid: {activeBatchItem.config.MAP_W}×
                {activeBatchItem.config.MAP_H} (Seed:{" "}
                {activeBatchItem.config.MAP_DEFAULT_SEED})
              </span>
            </div>
          )}
          <p className="batch-pending-desc">
            {isSolving
              ? "Solving ISP formulation via Mixed-Integer Linear Programming (MILP). Because the inverse problem under discrete terrain attributes is NP-hard, solving large grids or runs without graph reduction explores a large combinatorial space and may take several minutes depending on hardware. Please wait..."
              : "This configuration is queued and will execute automatically after preceding runs complete. Select any completed run above to inspect its metrics and tactical artifacts."}
          </p>
          {isSolving && typeof elapsedTime === "number" && (
            <div className="batch-elapsed-timer">
              Elapsed solver time: <strong>{elapsedTime}s</strong>
            </div>
          )}
        </div>
      )}

      {currentConfig && (
        <SolverConfigBadges
          config={currentConfig}
          mapImageUrl={currentMapImageUrl}
          cacheKey={cacheKey}
          onSelectMap={setSelectedImage}
        />
      )}

      {currentResult && (
        <div className="metrics-grid">
          <div className="metric-card">
            <span className="metric-label">Execution Time</span>
            <span className="metric-value">{runtimeDisplay}</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">ISP Iterations</span>
            <span className="metric-value">
              {currentResult.iterations ?? 0}
            </span>
          </div>

          <div className="metric-card optimal-card">
            <span className="metric-label">Initial Cost (A*)</span>
            <span className="metric-value">{origCostDisplay}</span>
          </div>

          <div className="metric-card alternative-card">
            <span className="metric-label">Alternative Cost</span>
            <span className="metric-value">{altCostDisplay}</span>
          </div>

          <div className="metric-card span-all modifications-card">
            <span className="metric-label">Semantic Modifications Applied</span>
            <div className="modifications-badges">
              <span className="mod-badge terrain">
                Terrain: {currentResult.modifications?.terrain ?? 0} modified
              </span>
              <span className="mod-badge obstacle">
                Obstacles: {currentResult.modifications?.obstacle ?? 0} removed
              </span>
              <span className="mod-badge slope">
                Slopes: {currentResult.modifications?.slope ?? 0} leveled
              </span>
            </div>
          </div>
        </div>
      )}

      {currentResult && explanationText && (
        <div className="report-card result-explanation-card">
          <div className="report-card-header">
            <h3>Solver Explanation</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => handleCopy(explanationText, "explanation")}
            >
              {copiedKey === "explanation" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="code-report">{explanationText}</pre>
        </div>
      )}

      {currentResult?.cost_baseline_text && (
        <div className="report-card">
          <div className="report-card-header">
            <h3>Alternative Route Cost Baselines</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                currentResult.cost_baseline_text &&
                handleCopy(currentResult.cost_baseline_text, "baseline")
              }
            >
              {copiedKey === "baseline" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="code-report">{currentResult.cost_baseline_text}</pre>
        </div>
      )}

      {tacticalArtifacts.length > 0 && (
        <div className="artifacts-card">
          <h3>Generated Tactical Artifacts</h3>
          <div className="artifacts-grid">
            {tacticalArtifacts.map((artifactPath) => (
              <ArtifactCard
                key={artifactPath}
                artifactPath={artifactPath}
                cacheKey={cacheKey}
                onSelect={setSelectedImage}
              />
            ))}
          </div>
        </div>
      )}

      {selectedImage && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-content is-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <span>{selectedImage.split("?")[0].split("/").pop()}</span>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setSelectedImage(null)}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>
            <img
              src={
                selectedImage.includes("?")
                  ? `${selectedImage}&t=${cacheKey}`
                  : `${selectedImage}?t=${cacheKey}`
              }
              alt="Enlarged artifact"
              className="modal-image"
            />
          </div>
        </div>
      )}
    </section>
  );
}
