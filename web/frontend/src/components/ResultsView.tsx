import { useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  LastResult,
  MapData,
  QueueItem,
  SemanticModificationsData,
  SystemConfig,
} from "../types";
import { ResultsExport } from "./ResultsExport";
import {
  isFrontendFailure,
  scientificOutcome,
  scientificOutcomeLabel,
} from "../utils/execution";
import { SolverConfigBadges } from "./SolverConfigBadges";
import {
  configuredValidationScope,
  directoryName,
  formatReductionMethod,
  formatValidationScope,
} from "../utils/formatters";
import { useMapCanvasFit } from "../utils/useMapCanvasFit";
import { TacticalMapCanvas, TacticalMapLegend } from "./TacticalMapCanvas";
import type { GridPoint } from "../utils/geometry";
import {
  hasCellOpening,
  interventionDescriptions,
} from "../utils/terrainAccess";
import { formatNumber, requestedLanguage, translate } from "../i18n";

const t = (message: string, variables?: Record<string, string | number>) =>
  translate(requestedLanguage(), message, variables);

interface ResultsViewProps {
  result: LastResult | null;
  records?: LastResult[];
  mapData?: MapData | null;
  userPath?: GridPoint[];
  artifacts: string[];
  cacheKey: number;
  onNewRun?: () => void;
  batchQueue?: QueueItem[];
  activeBatchIndex?: number;
  onSelectBatchIndex?: (index: number) => void;
  elapsedTime?: number;
  isSolving: boolean;
  config?: SystemConfig | null;
  mapImageUrl?: string;
  outputDirectory?: string | null;
}

function getArtifactFilename(artifactPath: string): string {
  return artifactPath.split("?")[0].split("/").pop() || artifactPath;
}

function formatMetric(value: number | null | undefined, decimals = 0): string {
  return typeof value === "number" && Number.isFinite(value)
    ? formatNumber(requestedLanguage(), value, decimals)
    : t("Unavailable");
}

function formatDistance(
  cells: number | null | undefined,
  meters: number | null | undefined,
): string {
  const cellValue =
    cells == null || !Number.isFinite(cells)
      ? t("Unavailable")
      : `${formatMetric(cells, 3)} ${t("cells")}`;
  const meterValue =
    meters == null || !Number.isFinite(meters)
      ? t("Unavailable")
      : `${formatMetric(meters, 3)} m`;
  return `${cellValue} / ${meterValue}`;
}

function formatRouteCost(
  value: number | null | undefined,
  state?: string,
): string {
  if (typeof value === "number" && Number.isFinite(value))
    return `${formatMetric(value, 2)} s`;
  if (state === "IMPASSABLE") return t("Impassable");
  if (state === "UNREACHABLE") return t("No path");
  return t("Unavailable");
}

function formatValidation(status?: string): string {
  if (status === "VALID") return t("Validated");
  if (status === "INVALID") return t("Not validated");
  if (status === "INCOMPLETE") return t("Incomplete");
  if (status === "NOT_RUN") return t("Not performed");
  return t("Unknown");
}

function getArtifactTitle(artifactPath: string): string {
  const filename = getArtifactFilename(artifactPath);
  if (filename === "map.png") return t("Base map");

  const title = filename.replace(/\.png$/, "").replaceAll("_", " ");
  return t(title.charAt(0).toUpperCase() + title.slice(1));
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

  const displayTitle = getArtifactTitle(artifactPath);
  const fullUrl = artifactPath.includes("?")
    ? `${artifactPath}&t=${cacheKey}`
    : `${artifactPath}?t=${cacheKey}`;

  return (
    <div
      className="artifact-item"
      onClick={() => onSelect(artifactPath)}
      title={t("Click to enlarge")}
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
            <span>{t("Rendering artifact...")}</span>
          </div>
        )}
        {hasError ? (
          <div className="artifact-placeholder-error">
            <span>{t("Artifact unavailable")}</span>
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
  records = [],
  mapData,
  userPath = [],
  artifacts,
  cacheKey,
  onNewRun,
  batchQueue,
  activeBatchIndex,
  onSelectBatchIndex,
  elapsedTime,
  isSolving: isExecutionRunning,
  config,
  mapImageUrl,
  outputDirectory,
}: ResultsViewProps) {
  const [internalBatchIndex, setInternalBatchIndex] = useState<number>(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [mapCanvasContainer, setMapCanvasContainer] =
    useState<HTMLDivElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [hoveredCell, setHoveredCell] = useState<GridPoint | null>(null);
  const [showOriginalMap, setShowOriginalMap] = useState(false);

  const isBatch = Boolean(batchQueue && batchQueue.length > 0);
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
  const preparedMapData = useMemo(
    () =>
      originalMapData && currentResult?.prepared_grid
        ? {
            ...originalMapData,
            ...currentResult.prepared_grid,
            optimal_path: currentResult.original_optimal_path ?? [],
          }
        : originalMapData,
    [originalMapData, currentResult],
  );
  const isBrandao = currentConfig?.ISP_MODEL === "BRANDAO";
  const currentMapData = isBrandao
    ? showOriginalMap
      ? originalMapData
      : preparedMapData
    : preparedMapData;
  const currentUserPath = isBatch
    ? (activeBatchItem?.userPath ??
      activeBatchItem?.mapData?.auto_path ??
      (activeBatchItem?.mapData ? [activeBatchItem.mapData.start] : []))
    : userPath;
  const mapHeight = currentMapData?.h;
  const mapWidth = currentMapData?.w;
  const mapCellSize = useMapCanvasFit(mapCanvasContainer, mapHeight, mapWidth);
  const maxZoomLevel = Math.max(3, 24 / mapCellSize);
  const [previousMapData, setPreviousMapData] = useState(originalMapData);
  const [previousBatchIndex, setPreviousBatchIndex] = useState(currentBatchIdx);
  if (
    previousMapData !== originalMapData ||
    previousBatchIndex !== currentBatchIdx
  ) {
    setPreviousMapData(originalMapData);
    setPreviousBatchIndex(currentBatchIdx);
    setHoveredCell(null);
    setZoomLevel(1.0);
    setShowOriginalMap(false);
  } else if (zoomLevel > maxZoomLevel) {
    setZoomLevel(maxZoomLevel);
  }
  const tacticalArtifacts = currentArtifacts.filter(
    (artifactPath) => getArtifactFilename(artifactPath) !== "map.png",
  );
  const currentStatus = isBatch
    ? activeBatchItem?.status
    : result
      ? (result.execution_status ?? "completed")
      : "pending";
  const isSolving = isBatch ? currentStatus === "solving" : false;

  useEffect(() => {
    const wrapper = mapCanvasContainer;
    if (!wrapper) return;

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          setZoomLevel((z) => Math.min(maxZoomLevel, z * 2));
        } else if (e.deltaY > 0) {
          setZoomLevel((z) => Math.max(1.0, z / 2));
        }
      }
    }

    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", handleWheel);
  }, [mapCanvasContainer, maxZoomLevel]);

  function getCellFromCoordinates(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): GridPoint | null {
    if (!currentMapData) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const x =
      event.clientX -
      rect.left +
      Number(event.currentTarget.dataset.offsetX ?? 0);
    const y =
      event.clientY -
      rect.top +
      Number(event.currentTarget.dataset.offsetY ?? 0);

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

  const hasModifications = (
    modifications: SemanticModificationsData | null | undefined,
  ) => {
    if (!modifications) return false;
    return (
      modifications.terrain +
        modifications.cell_opening +
        modifications.slope +
        modifications.environmental_speed +
        modifications.robot_capability >
      0
    );
  };

  type RunOutcome = "queued" | "solving" | ReturnType<typeof scientificOutcome>;
  function getRunOutcome(
    status: string | null | undefined,
    result: LastResult | null | undefined,
  ): RunOutcome {
    if (status === "solving") return "solving";
    if (["pending", "generating_map", "awaiting_route"].includes(status ?? ""))
      return "queued";
    if (status === "failed") return "error";
    return result ? scientificOutcome(result) : "inconclusive";
  }

  const currentOutcome = getRunOutcome(currentStatus, currentResult);
  const currentModifications = currentResult?.modifications ?? null;
  const hasCandidateModifications = hasModifications(currentModifications);
  const visibleModifications: SemanticModificationsData | null =
    hasCandidateModifications && !(isBrandao && showOriginalMap)
      ? currentModifications
      : null;
  const explanationText = currentResult
    ? (isFrontendFailure(currentResult)
        ? t(currentResult.explanation_text?.trim() ?? "")
        : currentResult.explanation_text?.trim()) ||
      t("No detailed explanation was returned for solver status {status}.", {
        status: currentResult.solver_status,
      })
    : null;
  const runtimeDisplay =
    typeof currentResult?.runtime_sec === "number"
      ? `${formatMetric(currentResult.runtime_sec, 3)}s`
      : "-";

  const origCostDisplay = formatRouteCost(
    currentResult?.original_optimal_cost,
    currentResult?.metrics?.cost_states?.original_optimal,
  );
  const altCostDisplay = formatRouteCost(
    currentResult?.final_alternative_cost,
    currentResult?.metrics?.cost_states?.final_alternative,
  );

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
  const cellOpening = hoveredCell
    ? visibleModifications?.cell_openings.find(
        ({ cell }) => cell[0] === hoveredCell[0] && cell[1] === hoveredCell[1],
      )
    : undefined;
  const isCellObstacleModified = Boolean(cellOpening?.original_obstacle);
  const isCellTerrainOpened = Boolean(cellOpening?.impassable_terrain);
  const interventionDetails = hoveredCell
    ? interventionDescriptions(
        visibleModifications,
        hoveredCell,
        requestedLanguage(),
      )
    : [];
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
      ? (currentMapData.terrain[hoveredCell[0]]?.[hoveredCell[1]] ?? "-")
      : "-";
  const hoveredTerrainSpeed = currentMapData?.speeds?.[hoveredTerrain];
  const isTerrainOpened = Boolean(
    hoveredCell &&
    currentMapData &&
    hasCellOpening(currentMapData, hoveredCell),
  );
  const hoveredTerrainBlocked =
    !isTerrainOpened &&
    !isCellTerrainOpened &&
    (hoveredTerrain === "WATER_RIVER" ||
      hoveredTerrainSpeed === undefined ||
      hoveredTerrainSpeed <= 0);
  const hoveredObstacleBlocked =
    (currentMapData?.obstacle[hoveredCell?.[0] ?? -1]?.[
      hoveredCell?.[1] ?? -1
    ] ?? 0) !== 0 && !isCellObstacleModified;

  const hoveredInfo =
    hoveredCell && currentMapData ? (
      <span>
        {t("Cell")} [{formatMetric(hoveredCell[0])},{" "}
        {formatMetric(hoveredCell[1])}] &bull; {t("Terrain")}{" "}
        <strong>
          {currentMapData.isp_model === "BRANDAO"
            ? hoveredObstacleBlocked || hoveredTerrainBlocked
              ? t("Blocked")
              : hoveredTerrain === "GRASS"
                ? t("Fast")
                : t("Slow")
            : t(hoveredTerrain)}
        </strong>
        {isCellTerrainModified && (
          <strong
            className="mod-badge terrain"
            style={{ marginLeft: "0.35rem" }}
          >
            {t("ISP Modified")}
          </strong>
        )}{" "}
        &bull; {t("Elevation")}{" "}
        <strong>
          {currentMapData.elevation[hoveredCell[0]]?.[hoveredCell[1]] ===
          undefined
            ? "-"
            : formatMetric(
                currentMapData.elevation[hoveredCell[0]][hoveredCell[1]],
                1,
              )}
          m
        </strong>{" "}
        &bull; {t("Status")}{" "}
        {hoveredObstacleBlocked ? (
          <strong className="cell-status cell-status-obstacle">
            {t("Obstacle")}
          </strong>
        ) : hoveredTerrainBlocked ? (
          <strong className="cell-status cell-status-impassable">
            {t("Impassable terrain")}
          </strong>
        ) : isCellTerrainOpened ? (
          <strong className="cell-status cell-status-free">
            {t("Traversable terrain at {speed} m/s before slope effects", {
              speed: cellOpening
                ? formatMetric(cellOpening.opened_speed_mps, 2)
                : "-",
            })}
          </strong>
        ) : (
          <strong className="cell-status cell-status-free">{t("Free")}</strong>
        )}
        {isCellObstacleModified && (
          <strong
            className="mod-badge obstacle"
            style={{ marginLeft: "0.35rem" }}
          >
            {t("Cleared")}
          </strong>
        )}
        {isCellTerrainOpened && (
          <strong
            className="mod-badge opened-terrain"
            style={{ marginLeft: "0.35rem" }}
          >
            {t("Cell made traversable")}
          </strong>
        )}
        {interventionDetails.map((detail) => (
          <span className="intervention-inspection" key={detail}>
            {detail}
          </span>
        ))}
        {isStart && (
          <strong
            className="node-marker start-badge"
            style={{ marginLeft: "0.35rem" }}
          >
            {t("Start")}
          </strong>
        )}
        {isGoal && (
          <strong
            className="node-marker goal-badge"
            style={{ marginLeft: "0.35rem" }}
          >
            {t("Goal")}
          </strong>
        )}
      </span>
    ) : (
      <span>
        {t("Hover over grid to inspect cell attributes and modifications")}
      </span>
    );

  return (
    <section className="results-container">
      <ResultsExport
        records={records}
        isSolving={isExecutionRunning}
        name={directoryName(outputDirectory)}
      />
      {isBatch && batchQueue && (
        <div className="batch-results-tabs-wrapper">
          <div
            className="batch-results-tabs"
            role="tablist"
            aria-label={t("Batch Runs")}
          >
            {batchQueue.map((item, idx) => {
              const isSelected = idx === currentBatchIdx;
              const outcome = getRunOutcome(item.status, item.result);
              const tabLabel =
                outcome === "solving"
                  ? t("Solving")
                  : outcome === "queued"
                    ? t("Queued")
                    : item.result
                      ? t(scientificOutcomeLabel(item.result))
                      : t("Inconclusive");
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
                    #{formatMetric(idx + 1)} ·{" "}
                    {item.config.ISP_MODEL === "BRANDAO" ? "Brandao · " : ""}
                    {item.config.USE_INCREMENTAL_SOLVER
                      ? t("Incremental")
                      : t("Monolithic")}
                    {item.config.ISP_MODEL !== "BRANDAO" &&
                      ` · ${t(formatReductionMethod(item.config.DEFAULT_REDUCTION_METHOD))}`}
                    {item.config.USE_INCREMENTAL_SOLVER &&
                      ` · ${t(formatValidationScope(item.result ? item.result.metrics?.effective_astar_scope : configuredValidationScope(item.config)))}`}
                  </span>
                  <span className={`batch-tab-badge status-${outcome}`}>
                    {tabLabel}
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
              ? t("Results & Metrics — Run {current} of {total}", {
                  current: formatMetric(currentBatchIdx + 1),
                  total: formatMetric(batchQueue!.length),
                })
              : t("Results & Metrics")}
          </h2>
          <span className={`status-pill large ${currentOutcome}`}>
            {currentOutcome === "solving"
              ? t("Solving")
              : currentOutcome === "queued"
                ? t("Queued")
                : currentResult
                  ? t(scientificOutcomeLabel(currentResult))
                  : t("Inconclusive")}
          </span>
        </div>

        {onNewRun && (
          <button
            type="button"
            className="btn btn-secondary results-new-run-action"
            onClick={onNewRun}
          >
            {t("New Run")}
          </button>
        )}
      </div>

      {currentMapData && (currentResult || currentStatus === "failed") && (
        <section className="results-map-card">
          <div className="results-map-header">
            <div>
              <h3>{t("Interactive Tactical Map")}</h3>
              <p className="subtitle">
                {isBrandao
                  ? showOriginalMap
                    ? t("Original map and its initial optimal route.")
                    : t(
                        "Prepared Brandao map: fast/slow costs 1:8, fixed obstacles and no slope effects.",
                      )
                  : t(
                      "Alternative route and ISP interventions on the active map.",
                    )}
              </p>
            </div>
            <div className="results-map-controls">
              {isBrandao && currentResult?.prepared_grid && originalMapData && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-pressed={showOriginalMap}
                  onClick={() => {
                    setShowOriginalMap((value) => !value);
                    setHoveredCell(null);
                  }}
                >
                  {showOriginalMap
                    ? t("Show Brandao map")
                    : t("Show original map")}
                </button>
              )}
              {currentOutcome === "inconclusive" &&
                currentResult?.metrics?.candidate_available && (
                  <span className="candidate-solution-badge candidate">
                    {t("CANDIDATE (GLOBAL VALIDATION NOT PASSED)")}
                  </span>
                )}
              {currentOutcome === "infeasible" && (
                <span className="candidate-solution-badge infeasible">
                  {t("NO FEASIBLE INTERVENTION")}
                </span>
              )}
              <div className="zoom-controls-bar">
                <span className="zoom-label">{t("Zoom")}</span>
                <button
                  type="button"
                  className="btn-zoom"
                  onClick={() => setZoomLevel((z) => Math.max(1.0, z / 2))}
                  disabled={zoomLevel <= 1.0}
                  title={t("Zoom out")}
                >
                  &minus;
                </button>
                <span className="zoom-value">
                  {formatMetric(Math.round(zoomLevel * 100))}%
                </span>
                <button
                  type="button"
                  className="btn-zoom"
                  onClick={() =>
                    setZoomLevel((z) => Math.min(maxZoomLevel, z * 2))
                  }
                  disabled={zoomLevel >= maxZoomLevel}
                  title={t("Zoom in")}
                >
                  +
                </button>
                <button
                  type="button"
                  className="btn-zoom btn-zoom-fit"
                  onClick={() => setZoomLevel(1.0)}
                  disabled={zoomLevel === 1.0}
                  title={t("Fit map to view")}
                >
                  {t("Fit")}
                </button>
              </div>
            </div>
          </div>

          {!hasCandidateModifications && (
            <p
              className={`results-notice ${currentOutcome === "validated" ? "info" : "warning"}`}
            >
              {currentOutcome === "infeasible"
                ? t(
                    "No valid modifications could be calculated; the alternative route is shown.",
                  )
                : currentOutcome === "validated"
                  ? t(
                      "The alternative route is validated; no changes are displayed.",
                    )
                  : t(
                      "No semantic changes are displayed; see validation and candidate status.",
                    )}
            </p>
          )}
          {currentResult?.solver_status === "OPTIMAL_INACCURATE" &&
            currentResult.success && (
              <p className="results-notice info">
                {t(
                  "Global path validation passed, but OPTIMAL_INACCURATE does not certify the minimum",
                )}{" "}
                {isBrandao
                  ? t("weighted intervention cost")
                  : t("intervention count")}
                .
              </p>
            )}

          <div
            className="canvas-wrapper results-map-canvas-wrapper"
            ref={setMapCanvasContainer}
          >
            <TacticalMapCanvas
              mapData={
                isBrandao ? currentMapData : (preparedMapData ?? currentMapData)
              }
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

      {isBatch && !currentResult && currentStatus !== "failed" && (
        <div className="batch-pending-card">
          <div className="batch-pending-spinner" />
          <h3>
            {isSolving
              ? t("Solving Run {current} of {total}...", {
                  current: currentBatchIdx + 1,
                  total: batchQueue!.length,
                })
              : t("Run {current} Pending in Queue", {
                  current: currentBatchIdx + 1,
                })}
          </h3>
          {isSolving && activeBatchItem?.config && (
            <div className="loading-params-summary">
              <span className="loading-param-chip">
                {t("Reduction:")}{" "}
                {t(
                  formatReductionMethod(
                    activeBatchItem.config.DEFAULT_REDUCTION_METHOD,
                  ),
                )}
              </span>
              <span className="loading-param-chip">
                {t("Solver:")}{" "}
                {activeBatchItem.config.USE_INCREMENTAL_SOLVER
                  ? `${t("Incremental MILP")} · ${t(formatValidationScope(configuredValidationScope(activeBatchItem.config)))}`
                  : t("Monolithic MILP")}
              </span>
              <span className="loading-param-chip">
                {t("Grid:")} {formatMetric(activeBatchItem.config.MAP_H)}×
                {formatMetric(activeBatchItem.config.MAP_W)} ({t("Seed:")}{" "}
                {formatMetric(activeBatchItem.config.MAP_DEFAULT_SEED)})
              </span>
            </div>
          )}
          <p className="batch-pending-desc">
            {isSolving
              ? t(
                  "Solving ISP formulation via Mixed-Integer Linear Programming (MILP). Because the inverse problem under discrete terrain attributes is NP-hard, solving large grids or runs without graph reduction explores a large combinatorial space and may take several minutes depending on hardware. Please wait...",
                )
              : t(
                  "This configuration is queued and will execute automatically after preceding runs complete. Select any completed run above to inspect its metrics and tactical artifacts.",
                )}
          </p>
          {isSolving && typeof elapsedTime === "number" && (
            <div className="batch-elapsed-timer">
              {t("Elapsed workflow time:")}{" "}
              <strong>{formatMetric(elapsedTime)}s</strong>
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
        <>
          {isBrandao && (
            <p className="subtitle">
              {t("Metrics and costs refer to the prepared Brandao scenario.")}
            </p>
          )}
          <div className="metrics-grid">
            {currentConfig?.USE_INCREMENTAL_SOLVER && (
              <div className="metric-card">
                <span className="metric-label">{t("Incremental Search")}</span>
                <span className="metric-value">
                  {t(
                    formatValidationScope(
                      currentResult.metrics?.effective_astar_scope,
                    ),
                  )}
                </span>
              </div>
            )}
            <div className="metric-card">
              <span className="metric-label">{t("Execution Time")}</span>
              <span className="metric-value">{runtimeDisplay}</span>
            </div>

            {currentConfig?.USE_INCREMENTAL_SOLVER && (
              <div className="metric-card">
                <span className="metric-label">{t("ISP Iterations")}</span>
                <span className="metric-value">
                  {formatMetric(currentResult.iterations)}
                </span>
              </div>
            )}

            <div className="metric-card optimal-card">
              <span className="metric-label">
                {t("Initial Optimal Route Cost")}
              </span>
              <span className="metric-value">{origCostDisplay}</span>
            </div>

            <div className="metric-card alternative-card">
              <span className="metric-label">
                {t("Initial Alternative Route Cost")}
              </span>
              <span className="metric-value">
                {formatRouteCost(
                  currentResult.original_alternative_cost,
                  currentResult.metrics?.cost_states?.original_alternative,
                )}
              </span>
            </div>
            <div className="metric-card alternative-card">
              <span className="metric-label">
                {t("Final Alternative Route Cost")}
              </span>
              <span className="metric-value">{altCostDisplay}</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">{t("Graph Nodes")}</span>
              <span className="metric-value">
                {formatMetric(currentResult.graph_nodes)}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">{t("Directed Edges")}</span>
              <span className="metric-value">
                {formatMetric(currentResult.graph_edges)}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">{t("Optimal Route Length")}</span>
              <span className="metric-value">
                {formatDistance(
                  currentResult.path_metrics?.optimal_length_cells,
                  currentResult.path_metrics?.optimal_length_m,
                )}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">
                {t("Alternative Route Length")}
              </span>
              <span className="metric-value">
                {formatDistance(
                  currentResult.path_metrics?.alternative_length_cells,
                  currentResult.path_metrics?.alternative_length_m,
                )}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">
                {t("Discrete Hausdorff Distance")}
              </span>
              <span className="metric-value">
                {formatDistance(
                  currentResult.path_metrics?.hausdorff_cells,
                  currentResult.path_metrics?.hausdorff_m,
                )}
              </span>
            </div>

            <div className="metric-card">
              <span className="metric-label">
                {t("Global Route Validation")}
              </span>
              <span className="metric-value">
                {formatValidation(currentResult.metrics?.validation_status)}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">{t("ISP Interventions")}</span>
              <span className="metric-value">
                {formatMetric(currentResult.metrics?.interventions?.total)}
              </span>
              {currentConfig?.ISP_MODEL === "BRANDAO" &&
                currentResult.metrics?.candidate_available && (
                  <span className="metric-label">
                    {t("Slow → fast:")}{" "}
                    {formatMetric(
                      currentResult.metrics.interventions?.slow_to_fast,
                    )}{" "}
                    · {t("Fast → slow:")}{" "}
                    {formatMetric(
                      currentResult.metrics.interventions?.fast_to_slow,
                    )}
                  </span>
                )}
            </div>
            {currentConfig?.ISP_MODEL === "BRANDAO" && (
              <div className="metric-card">
                <span className="metric-label">
                  {t("Weighted Intervention Cost")}
                </span>
                <span className="metric-value">
                  {formatMetric(
                    currentResult.metrics?.interventions?.objective_cost,
                  )}
                </span>
              </div>
            )}
            {currentConfig?.ISP_MODEL === "BRANDAO" && (
              <div className="metric-card">
                <span className="metric-label">
                  {t("Preparation Conversions")}
                </span>
                <span className="metric-value">
                  {formatMetric(
                    currentResult.metrics?.preparation?.converted_blocked_cells,
                  )}
                </span>
                <span className="metric-label">
                  {t("Excluded from ISP interventions")}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {(currentResult?.execution_error || activeBatchItem?.error) && (
        <p className="results-notice warning" role="alert">
          {currentResult?.execution_error
            ? isFrontendFailure(currentResult)
              ? t(currentResult.execution_error)
              : currentResult.execution_error
            : activeBatchItem?.error}
        </p>
      )}

      {currentResult && explanationText && (
        <div className="report-card result-explanation-card">
          <div className="report-card-header">
            <h3>{t("Solver Explanation")}</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => handleCopy(explanationText, "explanation")}
            >
              {copiedKey === "explanation" ? t("Copied") : t("Copy")}
            </button>
          </div>
          <pre className="code-report">{explanationText}</pre>
        </div>
      )}

      {currentResult?.cost_baseline_text && (
        <div className="report-card">
          <div className="report-card-header">
            <h3>{t("Alternative Route Cost Baselines")}</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                currentResult.cost_baseline_text &&
                handleCopy(currentResult.cost_baseline_text, "baseline")
              }
            >
              {copiedKey === "baseline" ? t("Copied") : t("Copy")}
            </button>
          </div>
          <pre className="code-report">{currentResult.cost_baseline_text}</pre>
        </div>
      )}

      {tacticalArtifacts.length > 0 && (
        <div className="artifacts-card">
          <h3>{t("Generated Tactical Artifacts")}</h3>
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
              <span>{getArtifactTitle(selectedImage)}</span>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setSelectedImage(null)}
                aria-label={t("Close dialog")}
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
              alt={getArtifactTitle(selectedImage)}
              className="modal-image"
            />
          </div>
        </div>
      )}
    </section>
  );
}
