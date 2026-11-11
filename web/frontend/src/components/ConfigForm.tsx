import { useEffect, useRef, useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import {
  fetchMapProfiles,
  browseDirectory,
  browseFiles,
  checkOutputDir,
  cleanOutputDir,
} from "../services/api";
import type { MapProfile, QueueItem, SystemConfig } from "../types";

interface ConfigFormProps {
  scenarioMode?: boolean;
  onBeforeGenerate?: () => boolean;
  onConfigChange?: () => void;
  onDraftChange: (config: SystemConfig) => void;
  initialConfig: SystemConfig | null;
  onGenerateMap: (
    config: SystemConfig,
    configurationName?: string,
    destinationDir?: string,
  ) => void;
  onAddToQueue: (
    config: SystemConfig,
    configurationName?: string,
    destinationDir?: string,
  ) => void;
  onAddBatch: (config: SystemConfig, count: number) => void;
  onImportConfig?: (
    data: Record<string, unknown>,
    configurationName?: string,
    destinationDir?: string,
  ) => void;
  onImportBatchConfigs?: (
    configs: { name: string; data: Record<string, unknown> }[],
  ) => void;
  isGenerating: boolean;
  workflowMode: "run" | "create";
  onSwitchWorkflowMode: (mode: "run" | "create") => void;
  activeMode: "individual" | "queue";
  onSwitchMode: (mode: "individual" | "queue") => void;
  queueCount: number;
  queue?: QueueItem[];
  configurationName: string;
  onConfigurationNameChange: (name: string) => void;
  configurationDestination: string;
  onConfigurationDestinationChange: (path: string) => void;
}

export function ConfigForm({
  scenarioMode = false,
  onBeforeGenerate,
  onConfigChange,
  onDraftChange,
  initialConfig,
  onGenerateMap,
  onAddToQueue,
  onAddBatch,
  onImportConfig,
  onImportBatchConfigs,
  isGenerating,
  workflowMode,
  onSwitchWorkflowMode,
  activeMode,
  onSwitchMode,
  queueCount,
  queue,
  configurationName,
  onConfigurationNameChange,
  configurationDestination,
  onConfigurationDestinationChange,
}: ConfigFormProps) {
  const [batchCount, setBatchCount] = useState(2);
  const [mapSizes, setMapSizes] = useState<MapProfile[]>([]);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [mapH, setMapH] = useState<number>(initialConfig?.MAP_H ?? 64);
  const [mapW, setMapW] = useState<number>(initialConfig?.MAP_W ?? 128);
  useEffect(() => {
    let active = true;
    fetchMapProfiles()
      .then((profiles) => {
        if (active) setMapSizes(profiles);
      })
      .catch((error: Error) => {
        if (active) setProfilesError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
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
    initialConfig?.OUTPUT_DIR ?? "",
  );
  const [outputDirError, setOutputDirError] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isConfigurationNameError = Boolean(
    outputDirError?.startsWith("Configuration name"),
  );
  const isOutputDirectoryError = Boolean(
    outputDirError && !isConfigurationNameError,
  );

  const [planner, setPlanner] = useState<string>(
    initialConfig?.DEFAULT_PLANNER ?? "ASTAR",
  );
  const [solver, setSolver] = useState<string>(
    initialConfig?.DEFAULT_SOLVER ?? "HIGHS",
  );
  const [solverTimeout, setSolverTimeout] = useState<number>(
    initialConfig?.SOLVER_TIMEOUT_SEC ?? 1800,
  );
  const [closedLoopTimeout, setClosedLoopTimeout] = useState<number>(
    initialConfig?.CLOSED_LOOP_TIMEOUT_SEC ?? 1800.0,
  );
  const [maxIspIterations, setMaxIspIterations] = useState<number>(
    initialConfig?.MAX_ISP_ITERATIONS ?? 150,
  );
  const [incrementalAstarScope, setIncrementalAstarScope] = useState<string>(
    initialConfig?.INCREMENTAL_ASTAR_SCOPE ?? "GLOBAL",
  );
  const [mapSeed, setMapSeed] = useState<number>(
    initialConfig?.MAP_DEFAULT_SEED ?? 42,
  );

  const [cleaningDirInfo, setCleaningDirInfo] = useState<{
    dir: string;
    fileCount: number;
    files: string[];
    onConfirm: () => void;
  } | null>(null);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);

  const selectedProfile = mapSizes.find(
    (size) => size.height === mapH && size.width === mapW,
  );

  function handleMapSizeChange(value: string) {
    const selectedSize = mapSizes.find(
      (option) => `${option.height}x${option.width}` === value,
    );
    if (!selectedSize) return;
    setMapH(selectedSize.height);
    setMapW(selectedSize.width);
  }

  function getCurrentConfig(): SystemConfig {
    return {
      ...(initialConfig || {}),
      ...(selectedProfile?.parameters ?? {}),
      MAP_H: Number(mapH),
      MAP_W: Number(mapW),
      CELL_SIZE: 1,
      CONNECTIVITY: Number(connectivity),
      DEFAULT_REDUCTION_METHOD: reductionMethod,
      USE_INCREMENTAL_SOLVER: useIncremental,
      OUTPUT_DIR:
        workflowMode === "run"
          ? outputDir.trim()
          : initialConfig?.OUTPUT_DIR || "",
      MAP_DEFAULT_SEED: Number(mapSeed),
      DEFAULT_PLANNER: planner,
      DEFAULT_SOLVER: solver,
      SOLVER_TIMEOUT_SEC: Number(solverTimeout),
      CLOSED_LOOP_TIMEOUT_SEC: Number(closedLoopTimeout),
      MAX_ISP_ITERATIONS: Number(maxIspIterations),
      INCREMENTAL_ASTAR_SCOPE: incrementalAstarScope,
    };
  }

  const draftRef = useRef<SystemConfig | null>(null);
  useEffect(() => {
    draftRef.current = getCurrentConfig();
  });
  useEffect(
    () => () => {
      if (draftRef.current) onDraftChange(draftRef.current);
    },
    [onDraftChange],
  );

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
    } catch (err) {
      void err;
    }
    action();
  }

  async function handleDirectRun() {
    const trimmed =
      workflowMode === "create"
        ? configurationDestination.trim()
        : outputDir.trim();
    if (!trimmed) {
      setOutputDirError("Select an output directory to continue.");
      return;
    }

    if (workflowMode === "create" && !configurationName.trim()) {
      setOutputDirError("Configuration name is required.");
      return;
    }

    if (onBeforeGenerate && !onBeforeGenerate()) return;
    setOutputDirError(null);
    const current = getCurrentConfig();
    if (workflowMode === "create") {
      onGenerateMap(current, configurationName.trim(), trimmed);
      return;
    }
    if (scenarioMode) onGenerateMap(current);
    else
      await ensureCleanDirectoryAndExecute(current.OUTPUT_DIR, () => {
        onGenerateMap(current);
      });
  }

  async function handleAddQueue() {
    const trimmed =
      workflowMode === "create"
        ? configurationDestination.trim()
        : outputDir.trim();
    if (!trimmed) {
      setOutputDirError("Select an output directory to continue.");
      return;
    }

    if (workflowMode === "create" && !configurationName.trim()) {
      setOutputDirError("Configuration name is required.");
      return;
    }

    const normalizedName = configurationName
      .trim()
      .replace(/\.json$/i, "")
      .toLowerCase();
    const isDuplicate = queue?.some((item) =>
      workflowMode === "create"
        ? item.configurationName
            ?.trim()
            .replace(/\.json$/i, "")
            .toLowerCase() === normalizedName
        : item.config.OUTPUT_DIR.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) {
      setOutputDirError(
        workflowMode === "create"
          ? `Configuration name "${configurationName.trim()}" is already in the batch queue.`
          : `Output directory "${trimmed}" is already in the batch queue. Please specify a unique directory.`,
      );
      return;
    }
    setOutputDirError(null);
    const current = getCurrentConfig();
    if (workflowMode === "create") {
      onAddToQueue(current, configurationName.trim(), trimmed);
      setFeedback("Configuration added to queue");
      setTimeout(() => setFeedback(null), 2500);
      return;
    }
    await ensureCleanDirectoryAndExecute(current.OUTPUT_DIR, () => {
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
        onConfigChange?.();
        if (workflowMode === "create") {
          onConfigurationDestinationChange(cleanPath);
        } else {
          setOutputDir(cleanPath);
        }
        setOutputDirError(null);
      }
    } catch {
      void 0;
    } finally {
      setIsBrowsing(false);
    }
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

  async function handleImportBrowse() {
    const selectedOutputDir = outputDir.trim();
    if (!selectedOutputDir) {
      setOutputDirError(
        "Select an output directory before importing a configuration.",
      );
      return;
    }

    setIsBrowsing(true);
    try {
      if (activeMode === "queue") {
        const result = await browseFiles(true);
        if (Array.isArray(result) && result.length > 0) {
          if (onImportBatchConfigs) {
            const root = selectedOutputDir.replace(/[\\/]+$/, "");
            onImportBatchConfigs(
              result.map((item, index) => {
                const folderName =
                  item.name
                    .replace(/\.json$/i, "")
                    .replace(/[^a-zA-Z0-9._-]+/g, "-")
                    .replace(/^[-.]+|[-.]+$/g, "") || `run-${index + 1}`;
                return {
                  ...item,
                  data: { ...item.data, OUTPUT_DIR: `${root}/${folderName}` },
                };
              }),
            );
          }
        }
      } else {
        const result = await browseFiles(false);
        if (result && !Array.isArray(result) && result.data) {
          if (onImportConfig) {
            if (workflowMode === "create") {
              const destination = configurationDestination.trim();
              const name = configurationName.trim();
              if (!destination || !name) {
                setOutputDirError(
                  !destination
                    ? "Select an output directory to continue."
                    : "Configuration name is required.",
                );
                return;
              }
              onImportConfig(result.data, name, destination);
            } else {
              onImportConfig({
                ...result.data,
                OUTPUT_DIR: selectedOutputDir,
              });
            }
          }
        }
      }
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : "Failed to import configuration",
      );
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setIsBrowsing(false);
    }
  }

  const isConfigurationDestinationLocked =
    workflowMode === "create" && activeMode === "queue" && queueCount > 0;

  return (
    <div className="config-card" onChangeCapture={onConfigChange}>
      {!scenarioMode && (
        <div className="mode-tabs" role="tablist" aria-label="Operational Mode">
          <button
            type="button"
            role="tab"
            aria-selected={workflowMode === "run"}
            className={`mode-tab ${workflowMode === "run" ? "active" : ""}`}
            onClick={() => onSwitchWorkflowMode("run")}
          >
            Run Experiment
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workflowMode === "create"}
            className={`mode-tab ${workflowMode === "create" ? "active" : ""}`}
            onClick={() => onSwitchWorkflowMode("create")}
          >
            Create Configuration
          </button>
        </div>
      )}

      {(workflowMode === "run" || !scenarioMode) && (
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
      )}

      <fieldset className="config-fieldset">
        <legend>Pipeline Configuration</legend>

        <div className="config-form-section">
          <div className="config-form-grid-pair">
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
                {!mapSizes.some(
                  (size) => size.height === mapH && size.width === mapW,
                ) && (
                  <option value={`${mapH}x${mapW}`}>
                    {mapH}×{mapW}
                  </option>
                )}
                {mapSizes.map((option) => (
                  <option
                    key={`${option.height}x${option.width}`}
                    value={`${option.height}x${option.width}`}
                  >
                    {option.height}×{option.width}
                  </option>
                ))}
              </select>
              {profilesError && (
                <span className="field-error-message" role="alert">
                  {profilesError}
                </span>
              )}
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
          </div>

          <div className="config-strategy-grid">
            <div className="strategy-column">
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
                  <option value="FLOODFILL">
                    Floodfill (Region Between Paths)
                  </option>
                  <option value="SPARSIFIED">
                    Sparsified (Chain Contraction)
                  </option>
                  <option value="PATH_ONLY">Path Only (Path Edges)</option>
                </select>
              </div>
            </div>

            <div className="strategy-column">
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
                    <span className="toggle-label">
                      {useIncremental
                        ? "Active (Incremental)"
                        : "Inactive (Monolithic)"}
                    </span>
                    <span className="switch-pill">
                      <span className="switch-knob" />
                    </span>
                  </button>
                </div>
              </div>

              <div
                className={
                  "conditional-field-wrapper " +
                  (useIncremental ? "is-active" : "is-inactive")
                }
              >
                <div className="conditional-inner-grid has-scope">
                  <div className="form-group">
                    <label htmlFor="maxIspIterations">
                      <span>Max ISP Iterations</span>
                      <span className="form-group-hint">
                        1–100 cutting planes
                      </span>
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
                      disabled={!useIncremental}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="incrementalAstarScope">
                      <span>Incremental A* Scope</span>
                      <span className="form-group-hint">
                        Competing paths search
                      </span>
                    </label>
                    <select
                      id="incrementalAstarScope"
                      value={incrementalAstarScope}
                      onChange={(e) => setIncrementalAstarScope(e.target.value)}
                      disabled={!useIncremental || reductionMethod === "NONE"}
                    >
                      <option value="GLOBAL">Global Grid</option>
                      <option value="SUBGRAPH">Reduced Subgraph</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="config-output-group">
            <div
              className={`form-group ${
                workflowMode === "create" ? "is-active" : "is-inactive"
              } ${
                workflowMode === "create" && isConfigurationNameError
                  ? "has-error"
                  : ""
              }`}
            >
              <label htmlFor="configurationName">
                <span>Configuration Name</span>
                <span className="form-group-hint">
                  Saved with a .json extension
                </span>
              </label>
              <input
                id="configurationName"
                type="text"
                value={configurationName}
                onChange={(event) => {
                  onConfigurationNameChange(event.target.value);
                  if (isConfigurationNameError) setOutputDirError(null);
                }}
                placeholder="Example: north-route-study"
                required
                disabled={workflowMode !== "create"}
                aria-invalid={
                  workflowMode === "create" && isConfigurationNameError
                }
                aria-describedby={
                  workflowMode === "create" && isConfigurationNameError
                    ? "configuration-name-error"
                    : undefined
                }
              />
              {workflowMode === "create" && isConfigurationNameError && (
                <span
                  id="configuration-name-error"
                  className="field-error-message"
                  role="alert"
                >
                  {outputDirError}
                </span>
              )}
            </div>

            <div
              className={`form-group is-active ${isOutputDirectoryError ? "has-error" : ""}`}
            >
              <label id="destinationDirLabel">
                <span>Output Directory</span>
                <span className="form-group-hint">
                  Required filesystem path
                </span>
              </label>
              <div className="input-with-button">
                <input
                  id="destinationDir"
                  type="text"
                  readOnly
                  tabIndex={-1}
                  value={
                    workflowMode === "create"
                      ? configurationDestination
                      : outputDir
                  }
                  placeholder="Click Browse... to select output directory"
                  required
                  aria-labelledby="destinationDirLabel"
                  aria-invalid={isOutputDirectoryError}
                  aria-describedby={
                    isOutputDirectoryError
                      ? "output-directory-error"
                      : undefined
                  }
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleBrowse}
                  disabled={
                    isGenerating ||
                    isBrowsing ||
                    isConfigurationDestinationLocked
                  }
                >
                  {isBrowsing ? "Opening..." : "Browse..."}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`advanced-settings-section ${isAdvancedOpen ? "is-open" : ""}`}
        >
          <button
            type="button"
            className="advanced-settings-summary"
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            aria-expanded={isAdvancedOpen}
            aria-controls="advanced-settings-collapse-region"
          >
            <div className="advanced-summary-title-row">
              <span className="advanced-summary-icon" aria-hidden="true">
                ▶
              </span>
              <div className="advanced-summary-content">
                <span className="advanced-summary-title">
                  Advanced Settings
                </span>
                <span className="advanced-summary-desc">
                  Planner, solver limits and map seed
                </span>
              </div>
            </div>
            <span className="advanced-settings-badge">Automatic terrain</span>
          </button>

          <div
            id="advanced-settings-collapse-region"
            className={`advanced-settings-collapse ${isAdvancedOpen ? "is-expanded" : ""}`}
            aria-hidden={!isAdvancedOpen}
          >
            <div className="advanced-settings-collapse-inner">
              <div className="advanced-settings-body">
                <div className="advanced-group">
                  <h4 className="advanced-group-title">
                    Planning &amp; Execution
                  </h4>
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
                        <span className="form-group-hint">HiGHS engine</span>
                      </label>
                      <select
                        id="defaultSolver"
                        value={solver}
                        onChange={(e) => setSolver(e.target.value)}
                      >
                        <option value="HIGHS">HIGHS</option>
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
                        onChange={(e) =>
                          setSolverTimeout(Number(e.target.value))
                        }
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="closedLoopTimeout">
                        <span>Closed-Loop Timeout</span>
                        <span className="form-group-hint">
                          Seconds for the full process
                        </span>
                      </label>
                      <input
                        id="closedLoopTimeout"
                        type="number"
                        min={0.001}
                        step={1}
                        value={closedLoopTimeout}
                        onChange={(e) =>
                          setClosedLoopTimeout(Number(e.target.value))
                        }
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="advanced-group">
                  <h4 className="advanced-group-title">Map &amp; Grid</h4>
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
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions-row">
          <div className="primary-actions">
            {activeMode === "individual" && (
              <button
                type="button"
                className="btn btn-vibrant"
                onClick={handleDirectRun}
                disabled={isGenerating}
              >
                {isGenerating ? "Generating Map..." : "Generate Map"}
              </button>
            )}

            {activeMode === "queue" && workflowMode === "run" && (
              <>
                <label className="batch-count-label" htmlFor="batch-count">
                  Number of maps
                  <input
                    id="batch-count"
                    type="number"
                    min={2}
                    max={100}
                    value={batchCount}
                    onChange={(event) =>
                      setBatchCount(Number(event.target.value))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-vibrant"
                  disabled={
                    isGenerating ||
                    !Number.isInteger(batchCount) ||
                    batchCount < 2 ||
                    batchCount > 100
                  }
                  onClick={() => {
                    const current = getCurrentConfig();
                    if (!current.OUTPUT_DIR.trim()) {
                      setOutputDirError(
                        "Select an output directory to continue.",
                      );
                      return;
                    }
                    if (onBeforeGenerate && !onBeforeGenerate()) return;
                    setOutputDirError(null);
                    onAddBatch(current, batchCount);
                  }}
                >
                  Generate Batch
                </button>
              </>
            )}
            {activeMode === "queue" && !scenarioMode && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAddQueue}
                disabled={isGenerating}
              >
                {workflowMode === "create"
                  ? "+ Add Configuration"
                  : "+ Add to Queue"}
              </button>
            )}

            {workflowMode !== "create" && !scenarioMode && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleImportBrowse}
                disabled={isGenerating || isBrowsing}
                title={
                  activeMode === "queue"
                    ? "Import one or more configuration JSON files into the queue"
                    : "Import configuration JSON and load alternative route"
                }
              >
                {isBrowsing ? "Opening..." : "Import Configuration"}
              </button>
            )}
          </div>

          {feedback && <span className="action-feedback">{feedback}</span>}
        </div>
      </fieldset>

      {isOutputDirectoryError && (
        <div
          id="output-directory-error"
          className="validation-toast"
          role="alert"
          aria-live="assertive"
        >
          <span>{outputDirError}</span>
          <button
            type="button"
            className="alert-close"
            onClick={() => setOutputDirError(null)}
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      )}

      {cleaningDirInfo && (
        <ConfirmModal
          title="Existing Files in Output Directory"
          description={
            <>
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
            </>
          }
          warning="Continuing will delete these previous files to ensure stale artifacts from earlier runs do not appear in results."
          confirmLabel={
            isCleaning
              ? "Deleting Previous Files..."
              : "Continue & Delete Files"
          }
          busy={isCleaning}
          onClose={() => setCleaningDirInfo(null)}
          onConfirm={handleConfirmClean}
        />
      )}
    </div>
  );
}
