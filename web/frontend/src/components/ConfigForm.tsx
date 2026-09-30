import { useState } from "react";
import {
  browseDirectory,
  checkOutputDir,
  cleanOutputDir,
} from "../services/api";
import type { SystemConfig } from "../types";

interface ConfigFormProps {
  initialConfig: SystemConfig | null;
  onGenerateMap: (config: SystemConfig) => void;
  onAddToQueue: (config: SystemConfig) => void;
  isGenerating: boolean;
  activeMode: "individual" | "queue";
  onSwitchMode: (mode: "individual" | "queue") => void;
  queueCount: number;
}

const MAP_SIZE_OPTIONS = [
  { height: 16, width: 32 },
  { height: 32, width: 64 },
  { height: 64, width: 128 },
  { height: 128, width: 256 },
  { height: 256, width: 512 },
  { height: 512, width: 1024 },
] as const;

function resolveMapSize(height?: number, width?: number) {
  return (
    MAP_SIZE_OPTIONS.find(
      (option) => option.height === height && option.width === width,
    ) ?? MAP_SIZE_OPTIONS[2]
  );
}

export function ConfigForm({
  initialConfig,
  onGenerateMap,
  onAddToQueue,
  isGenerating,
  activeMode,
  onSwitchMode,
  queueCount,
}: ConfigFormProps) {
  const initialMapSize = resolveMapSize(
    initialConfig?.MAP_H,
    initialConfig?.MAP_W,
  );
  const [mapH, setMapH] = useState<number>(initialMapSize.height);
  const [mapW, setMapW] = useState<number>(initialMapSize.width);
  const [connectivity, setConnectivity] = useState<number>(
    initialConfig?.CONNECTIVITY ?? 8,
  );
  const [reductionMethod, setReductionMethod] = useState<string>(
    initialConfig?.DEFAULT_REDUCTION_METHOD ?? "NONE",
  );
  const [useIncremental, setUseIncremental] = useState<boolean>(
    initialConfig?.USE_INCREMENTAL_SOLVER ?? false,
  );
  const [outputDir, setOutputDir] = useState<string>(
    initialConfig?.OUTPUT_DIR ?? "output",
  );
  const [isBrowsing, setIsBrowsing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [planner, setPlanner] = useState<string>(
    initialConfig?.DEFAULT_PLANNER ?? "ASTAR",
  );
  const [solver, setSolver] = useState<string>(
    initialConfig?.DEFAULT_SOLVER ?? "HIGHS",
  );
  const [solverTimeout, setSolverTimeout] = useState<number>(
    initialConfig?.SOLVER_TIMEOUT_SEC ?? 6000,
  );
  const [targetTerrain, setTargetTerrain] = useState<string>(
    initialConfig?.TARGET_TERRAIN ?? "COMPACTED_SOIL",
  );
  const [maxIspIterations, setMaxIspIterations] = useState<number>(
    initialConfig?.MAX_ISP_ITERATIONS ?? 50,
  );
  const [bboxMargin, setBboxMargin] = useState<number>(
    initialConfig?.BBOX_MARGIN ?? 2,
  );
  const [incrementalAstarScope, setIncrementalAstarScope] = useState<string>(
    initialConfig?.INCREMENTAL_ASTAR_SCOPE ?? "GLOBAL",
  );
  const [mapSeed, setMapSeed] = useState<number>(
    initialConfig?.MAP_DEFAULT_SEED ?? 42,
  );
  const [mapElevationScale, setMapElevationScale] = useState<number>(
    initialConfig?.MAP_ELEVATION_SCALE ?? 2.0,
  );
  const [mapElevationFreq, setMapElevationFreq] = useState<number>(
    initialConfig?.MAP_ELEVATION_FREQ ?? 0.06,
  );
  const [mapObstacleFreq, setMapObstacleFreq] = useState<number>(
    initialConfig?.MAP_OBSTACLE_FREQ ?? 0.05,
  );
  const [mapObstacleThreshold, setMapObstacleThreshold] = useState<number>(
    initialConfig?.MAP_OBSTACLE_THRESHOLD ?? 0.85,
  );

  const [cleaningDirInfo, setCleaningDirInfo] = useState<{
    dir: string;
    fileCount: number;
    files: string[];
    onConfirm: () => void;
  } | null>(null);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);

  function handleMapSizeChange(value: string) {
    const selectedSize = MAP_SIZE_OPTIONS.find(
      (option) => `${option.height}x${option.width}` === value,
    );
    if (!selectedSize) return;
    setMapH(selectedSize.height);
    setMapW(selectedSize.width);
  }

  function getCurrentConfig(): SystemConfig {
    return {
      ...(initialConfig || {}),
      MAP_H: Number(mapH),
      MAP_W: Number(mapW),
      CONNECTIVITY: Number(connectivity),
      DEFAULT_REDUCTION_METHOD: reductionMethod,
      USE_INCREMENTAL_SOLVER: useIncremental,
      OUTPUT_DIR: outputDir.trim() || "output",
      MAP_DEFAULT_SEED: Number(mapSeed),
      DEFAULT_PLANNER: planner,
      DEFAULT_SOLVER: solver,
      SOLVER_TIMEOUT_SEC: Number(solverTimeout),
      TARGET_TERRAIN: targetTerrain,
      MAX_ISP_ITERATIONS: Number(maxIspIterations),
      BBOX_MARGIN: Number(bboxMargin),
      INCREMENTAL_ASTAR_SCOPE: incrementalAstarScope,
      MAP_ELEVATION_SCALE: Number(mapElevationScale),
      MAP_ELEVATION_FREQ: Number(mapElevationFreq),
      MAP_OBSTACLE_FREQ: Number(mapObstacleFreq),
      MAP_OBSTACLE_THRESHOLD: Number(mapObstacleThreshold),
    };
  }

  async function ensureCleanDirectoryAndExecute(
    targetDir: string,
    action: () => void,
  ) {
    const trimmed = targetDir.trim();
    if (!trimmed) {
      action();
      return;
    }
    try {
      const check = await checkOutputDir(trimmed);
      if (check.exists && check.file_count > 0) {
        setCleaningDirInfo({
          dir: trimmed,
          fileCount: check.file_count,
          files: check.files,
          onConfirm: () => {
            setFeedback(`Cleaned output directory: ${trimmed}`);
            setTimeout(() => setFeedback(null), 3000);
            action();
          },
        });
        return;
      }
    } catch {}
    action();
  }

  function handleDirectRun() {
    const current = getCurrentConfig();
    ensureCleanDirectoryAndExecute(current.OUTPUT_DIR, () => {
      onGenerateMap(current);
    });
  }

  function handleAddQueue() {
    const current = getCurrentConfig();
    ensureCleanDirectoryAndExecute(current.OUTPUT_DIR, () => {
      onAddToQueue(current);
      setFeedback("Configuration added to queue");
      setTimeout(() => setFeedback(null), 2500);
    });
  }

  async function handleBrowse() {
    setIsBrowsing(true);
    try {
      const selected = await browseDirectory();
      if (selected && selected.trim()) {
        const cleanPath = selected.trim();
        setOutputDir(cleanPath);
        const check = await checkOutputDir(cleanPath);
        if (check.exists && check.file_count > 0) {
          setCleaningDirInfo({
            dir: cleanPath,
            fileCount: check.file_count,
            files: check.files,
            onConfirm: () => {
              setFeedback(`Cleaned output directory: ${cleanPath}`);
              setTimeout(() => setFeedback(null), 3000);
            },
          });
        }
      }
    } catch {
    } finally {
      setIsBrowsing(false);
    }
  }

  async function handleOutputDirBlur() {
    const trimmed = outputDir.trim();
    if (!trimmed) return;
    try {
      const check = await checkOutputDir(trimmed);
      if (check.exists && check.file_count > 0) {
        setCleaningDirInfo({
          dir: trimmed,
          fileCount: check.file_count,
          files: check.files,
          onConfirm: () => {
            setFeedback(`Cleaned output directory: ${trimmed}`);
            setTimeout(() => setFeedback(null), 3000);
          },
        });
      }
    } catch {}
  }

  async function handleConfirmClean() {
    if (!cleaningDirInfo) return;
    setIsCleaning(true);
    try {
      await cleanOutputDir(cleaningDirInfo.dir);
      const callback = cleaningDirInfo.onConfirm;
      setCleaningDirInfo(null);
      callback();
    } catch {
      setCleaningDirInfo(null);
    } finally {
      setIsCleaning(false);
    }
  }

  return (
    <div className="config-card">
      <div className="mode-tabs" role="tablist" aria-label="Execution Mode">
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === "individual"}
          className={`mode-tab ${activeMode === "individual" ? "active" : ""}`}
          onClick={() => onSwitchMode("individual")}
        >
          Single Run
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === "queue"}
          className={`mode-tab ${activeMode === "queue" ? "active" : ""}`}
          onClick={() => onSwitchMode("queue")}
        >
          <span>Batch Queue</span>
          {queueCount > 0 && <span className="tab-badge">{queueCount}</span>}
        </button>
      </div>

      <fieldset className="config-fieldset">
        <legend>Pipeline Configuration</legend>

        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="mapSize">
              <span>Map Size</span>
              <span className="form-group-hint">Approved resolutions</span>
            </label>
            <select
              id="mapSize"
              value={`${mapH}x${mapW}`}
              onChange={(e) => handleMapSizeChange(e.target.value)}
            >
              {MAP_SIZE_OPTIONS.map((option) => (
                <option
                  key={`${option.height}x${option.width}`}
                  value={`${option.height}x${option.width}`}
                >
                  {option.height}×{option.width}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="connectivity">
              <span>Connectivity</span>
              <span className="form-group-hint">Neighborhood</span>
            </label>
            <select
              id="connectivity"
              value={connectivity}
              onChange={(e) => setConnectivity(Number(e.target.value))}
            >
              <option value={8}>8-Connected (Chebyshev / Diagonal)</option>
              <option value={4}>4-Connected (Manhattan / Orthogonal)</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="reductionMethod">
              <span>Graph Reduction</span>
              <span className="form-group-hint">Pruning strategy</span>
            </label>
            <select
              id="reductionMethod"
              value={reductionMethod}
              onChange={(e) => setReductionMethod(e.target.value)}
            >
              <option value="NONE">None (Full Grid Graph)</option>
              <option value="BBOX">BBOX (Bounding Box)</option>
              <option value="FLOODFILL">Floodfill (Reachable Subgraph)</option>
              <option value="SPARSIFIED">Sparsified (Corridor Graph)</option>
              <option value="PATH_ONLY">
                Path Only (Strict Path Corridor)
              </option>
            </select>
          </div>

          {reductionMethod === "BBOX" && (
            <div className="form-group">
              <label htmlFor="bboxMargin">
                <span>BBox Margin</span>
                <span className="form-group-hint">Min 1 cell buffer</span>
              </label>
              <input
                id="bboxMargin"
                type="number"
                min={1}
                step={1}
                value={bboxMargin}
                onChange={(e) => setBboxMargin(Number(e.target.value))}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="incrementalToggle">
              <span>Incremental Solver</span>
              <span className="form-group-hint">Cutting-plane method</span>
            </label>
            <div className="toggle-container">
              <button
                type="button"
                id="incrementalToggle"
                role="switch"
                aria-checked={useIncremental}
                className={`toggle-btn ${useIncremental ? "active" : ""}`}
                onClick={() => setUseIncremental(!useIncremental)}
              >
                <span className="switch-pill">
                  <span className="switch-knob" />
                </span>
                <span className="toggle-label">
                  {useIncremental
                    ? "Active (Incremental)"
                    : "Inactive (Monolithic)"}
                </span>
              </button>
            </div>
          </div>

          {useIncremental && (
            <div className="form-group">
              <label htmlFor="maxIspIterations">
                <span>Max ISP Iterations</span>
                <span className="form-group-hint">1–100 cutting planes</span>
              </label>
              <input
                id="maxIspIterations"
                type="number"
                min={1}
                max={100}
                step={1}
                value={maxIspIterations}
                onChange={(e) =>
                  setMaxIspIterations(Number(e.target.value))
                }
                required
              />
            </div>
          )}

          {useIncremental && reductionMethod !== "NONE" && (
            <div className="form-group">
              <label htmlFor="incrementalAstarScope">
                <span>Incremental A* Scope</span>
                <span className="form-group-hint">Competing paths search</span>
              </label>
              <select
                id="incrementalAstarScope"
                value={incrementalAstarScope}
                onChange={(e) => setIncrementalAstarScope(e.target.value)}
              >
                <option value="GLOBAL">Global Grid</option>
                <option value="SUBGRAPH">Reduced Subgraph</option>
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="outputDir">
              <span>Output Directory</span>
              <span className="form-group-hint">Filesystem path</span>
            </label>
            <div className="input-with-button">
              <input
                id="outputDir"
                type="text"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                onBlur={handleOutputDirBlur}
                placeholder="output"
                required
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleBrowse}
                disabled={isGenerating || isBrowsing}
              >
                {isBrowsing ? "Opening..." : "Browse..."}
              </button>
            </div>
          </div>
        </div>

        <details className="advanced-settings-section">
          <summary className="advanced-settings-summary">
            <div className="advanced-summary-title-row">
              <span className="advanced-summary-icon" aria-hidden="true">
                ▶
              </span>
              <div className="advanced-summary-content">
                <span className="advanced-summary-title">
                  Advanced Settings
                </span>
                <span className="advanced-summary-desc">
                  Planners, solvers, objective weights, iterations &amp;
                  procedural map heuristics
                </span>
              </div>
            </div>
            <span className="advanced-settings-badge">9 Parameters</span>
          </summary>

          <div className="advanced-settings-body">
            <div className="advanced-group">
              <h4 className="advanced-group-title">Planning &amp; Solver</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="defaultPlanner">
                    <span>Default Planner</span>
                    <span className="form-group-hint">Shortest path</span>
                  </label>
                  <select
                    id="defaultPlanner"
                    value={planner}
                    onChange={(e) => setPlanner(e.target.value)}
                  >
                    <option value="ASTAR">ASTAR</option>
                    <option value="DIJKSTRA">DIJKSTRA</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="defaultSolver">
                    <span>MILP Solver</span>
                    <span className="form-group-hint">Optimization engine</span>
                  </label>
                  <select
                    id="defaultSolver"
                    value={solver}
                    onChange={(e) => setSolver(e.target.value)}
                  >
                    <option value="HIGHS">HIGHS</option>
                    <option value="SCIP">SCIP</option>
                    <option value="CBC">CBC</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="solverTimeout">
                    <span>Solver Timeout (sec)</span>
                    <span className="form-group-hint">
                      Per-solve time limit
                    </span>
                  </label>
                  <input
                    id="solverTimeout"
                    type="number"
                    min={1}
                    step={1}
                    value={solverTimeout}
                    onChange={(e) => setSolverTimeout(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="advanced-group">
              <h4 className="advanced-group-title">ISP Objective</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="targetTerrain">
                    <span>Target Terrain</span>
                    <span className="form-group-hint">Modification target</span>
                  </label>
                  <select
                    id="targetTerrain"
                    value={targetTerrain}
                    onChange={(e) => setTargetTerrain(e.target.value)}
                  >
                    <option value="COMPACTED_SOIL">COMPACTED_SOIL</option>
                    <option value="GRASSLAND">GRASSLAND</option>
                    <option value="UNPAVED_TRACK">UNPAVED_TRACK</option>
                    <option value="SAND">SAND</option>
                    <option value="FOREST">FOREST</option>
                    <option value="ROCKY">ROCKY</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="advanced-group">
              <h4 className="advanced-group-title">Map Generation Tuning</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="mapSeed">
                    <span>Map Default Seed</span>
                    <span className="form-group-hint">Noise RNG seed</span>
                  </label>
                  <input
                    id="mapSeed"
                    type="number"
                    value={mapSeed}
                    onChange={(e) => setMapSeed(Number(e.target.value))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="mapElevationScale">
                    <span>Elevation Scale</span>
                    <span className="form-group-hint">Height multiplier</span>
                  </label>
                  <input
                    id="mapElevationScale"
                    type="number"
                    step={0.1}
                    value={mapElevationScale}
                    onChange={(e) =>
                      setMapElevationScale(Number(e.target.value))
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="mapElevationFreq">
                    <span>Elevation Frequency</span>
                    <span className="form-group-hint">
                      Perlin terrain frequency
                    </span>
                  </label>
                  <input
                    id="mapElevationFreq"
                    type="number"
                    step={0.01}
                    value={mapElevationFreq}
                    onChange={(e) =>
                      setMapElevationFreq(Number(e.target.value))
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="mapObstacleFreq">
                    <span>Obstacle Frequency</span>
                    <span className="form-group-hint">
                      Cluster distribution scale
                    </span>
                  </label>
                  <input
                    id="mapObstacleFreq"
                    type="number"
                    step={0.01}
                    value={mapObstacleFreq}
                    onChange={(e) => setMapObstacleFreq(Number(e.target.value))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="mapObstacleThreshold">
                    <span>Obstacle Threshold</span>
                    <span className="form-group-hint">
                      Threshold cutoff (0–1)
                    </span>
                  </label>
                  <input
                    id="mapObstacleThreshold"
                    type="number"
                    step={0.05}
                    min={0}
                    max={1}
                    value={mapObstacleThreshold}
                    onChange={(e) =>
                      setMapObstacleThreshold(Number(e.target.value))
                    }
                    required
                  />
                </div>
              </div>
            </div>
          </div>
        </details>

        <div className="form-actions-row">
          <div className="primary-actions">
            <button
              type="button"
              className="btn btn-vibrant"
              onClick={handleDirectRun}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating Map..." : "Generate Map"}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleAddQueue}
              disabled={isGenerating}
            >
              + Add to Queue
            </button>
          </div>

          {feedback && <span className="action-feedback">{feedback}</span>}
        </div>
      </fieldset>

      {cleaningDirInfo && (
        <div
          className="modal-backdrop"
          onClick={() => !isCleaning && setCleaningDirInfo(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="confirm-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <h3>Existing Files in Output Directory</h3>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => !isCleaning && setCleaningDirInfo(null)}
                aria-label="Close dialog"
                disabled={isCleaning}
              >
                &times;
              </button>
            </div>

            <p className="confirm-modal-desc">
              The directory <strong>&quot;{cleaningDirInfo.dir}&quot;</strong>{" "}
              currently contains{" "}
              <strong>{cleaningDirInfo.fileCount} file(s)</strong>
              {cleaningDirInfo.files.length > 0 && (
                <>
                  {" "}
                  (such as:{" "}
                  <code>{cleaningDirInfo.files.slice(0, 3).join(", ")}</code>
                  {cleaningDirInfo.files.length > 3 ? ", ..." : ""})
                </>
              )}
              .
            </p>

            <div className="confirm-modal-warning">
              Continuing will delete these previous files to ensure stale
              artifacts from earlier runs do not appear in results.
            </div>

            <div className="confirm-modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCleaningDirInfo(null)}
                disabled={isCleaning}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-vibrant"
                onClick={handleConfirmClean}
                disabled={isCleaning}
              >
                {isCleaning
                  ? "Deleting Previous Files..."
                  : "Continue & Delete Files"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
