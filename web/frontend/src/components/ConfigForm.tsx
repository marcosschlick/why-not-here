import { useEffect, useRef, useState } from "react";
import { fetchMapProfiles } from "../services/api";
import type { MapProfile, SystemConfig } from "../types";

interface ConfigFormProps {
  scenarioMode?: boolean;
  benchmark: boolean;
  onBenchmarkChange: (enabled: boolean) => void;
  onBeforeGenerate?: (action: () => void) => void;
  onConfigChange?: () => void;
  onDraftChange: (config: SystemConfig) => void;
  initialConfig: SystemConfig | null;
  onGenerateMap: (config: SystemConfig, benchmark: boolean) => void;
  onAddToQueue: (config: SystemConfig, benchmark: boolean) => void;
  onImportConfig?: (data: Record<string, unknown>, benchmark: boolean) => void;
  onImportBatchConfigs?: (
    configs: { name: string; data: Record<string, unknown> }[],
    benchmark: boolean,
  ) => void;
  isGenerating: boolean;
  workflowMode: "run" | "create";
  onSwitchWorkflowMode: (mode: "run" | "create") => void;
  activeMode: "individual" | "queue";
  onSwitchMode: (mode: "individual" | "queue") => void;
  queueCount: number;
}

export function ConfigForm({
  scenarioMode = false,
  benchmark,
  onBenchmarkChange,
  onBeforeGenerate,
  onConfigChange,
  onDraftChange,
  initialConfig,
  onGenerateMap,
  onAddToQueue,
  onImportConfig,
  onImportBatchConfigs,
  isGenerating,
  workflowMode,
  onSwitchWorkflowMode,
  activeMode,
  onSwitchMode,
  queueCount,
}: ConfigFormProps) {
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
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

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

  const fileInputRef = useRef<HTMLInputElement>(null);
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

  function handleDirectRun() {
    const generate = () => {
      onGenerateMap(getCurrentConfig(), !scenarioMode && benchmark);
    };
    if (onBeforeGenerate) onBeforeGenerate(generate);
    else generate();
  }

  function handleAddQueue() {
    onAddToQueue(getCurrentConfig(), !scenarioMode && benchmark);
    setFeedback(
      scenarioMode
        ? "Scenario configuration added to queue"
        : benchmark
          ? "Benchmark group added to queue"
          : "Configuration added to queue",
    );
    setTimeout(() => setFeedback(null), 2500);
  }

  async function handleImportFiles(files: FileList | null) {
    if (!files?.length) return;
    setIsImporting(true);
    try {
      const items = await Promise.all(
        Array.from(files, async (file) => ({
          name: file.name,
          data: JSON.parse(await file.text()) as Record<string, unknown>,
        })),
      );
      if (activeMode === "queue")
        onImportBatchConfigs?.(items, !scenarioMode && benchmark);
      else onImportConfig?.(items[0].data, !scenarioMode && benchmark);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Failed to import configuration.",
      );
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

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

          <div
            className={`config-strategy-grid ${scenarioMode ? "scenario-strategy-grid" : "simulation-strategy-grid"}`}
          >
            <div className="strategy-column">
              <div className="form-group">
                <label htmlFor="reductionMethod">
                  <span>Graph Reduction</span>
                  <span className="form-group-hint">Pruning strategy</span>
                </label>
                <select
                  id="reductionMethod"
                  disabled={!scenarioMode && benchmark}
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
                    disabled={!scenarioMode && benchmark}
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
            </div>
            <div
              className={
                "conditional-field-wrapper " +
                (useIncremental || (!scenarioMode && benchmark)
                  ? "is-active"
                  : "is-inactive")
              }
            >
              <div className="conditional-inner-grid has-scope">
                <div className="form-group">
                  <label htmlFor="maxIspIterations">
                    <span>Max ISP Iterations</span>
                    <span className="form-group-hint">Cutting-plane limit</span>
                  </label>
                  <input
                    id="maxIspIterations"
                    type="number"
                    min={1}
                    step={1}
                    value={maxIspIterations}
                    onChange={(e) =>
                      setMaxIspIterations(Number(e.target.value))
                    }
                    required
                    disabled={!useIncremental && (scenarioMode || !benchmark)}
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
                    disabled={
                      (!useIncremental || reductionMethod === "NONE") &&
                      (scenarioMode || !benchmark)
                    }
                  >
                    <option value="GLOBAL">Global Grid</option>
                    <option value="SUBGRAPH">Reduced Subgraph</option>
                  </select>
                </div>
              </div>
            </div>
            {!scenarioMode && (
              <div className="strategy-column benchmark-setting">
                <div className="form-group">
                  <label htmlFor="benchmarkToggle">
                    <span>Benchmark</span>
                    <span className="form-group-hint">
                      10 combinations per map
                    </span>
                  </label>
                  <div className="toggle-container">
                    <button
                      type="button"
                      id="benchmarkToggle"
                      aria-label="Benchmark"
                      role="switch"
                      aria-checked={benchmark}
                      aria-describedby="benchmark-description"
                      className={`toggle-btn ${benchmark ? "active" : ""}`}
                      onClick={() => onBenchmarkChange(!benchmark)}
                      disabled={isGenerating}
                    >
                      <span className="toggle-label">
                        {benchmark ? "On" : "Off"}
                      </span>
                      <span className="switch-pill">
                        <span className="switch-knob" />
                      </span>
                    </button>
                  </div>
                  <span
                    id="benchmark-description"
                    className="benchmark-description"
                  >
                    Runs all solver and reduction combinations; individual
                    choices are disabled.
                  </span>
                </div>
              </div>
            )}
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

            {activeMode === "queue" && (
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

            {workflowMode !== "create" && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating || isImporting}
                title={
                  activeMode === "queue"
                    ? "Import one or more configuration JSON files into the queue"
                    : "Import configuration JSON and load alternative route"
                }
              >
                {isImporting ? "Opening..." : "Import Configuration"}
              </button>
            )}
          </div>

          {feedback && <span className="action-feedback">{feedback}</span>}
        </div>
      </fieldset>

      {importError && (
        <div
          id="import-error"
          className="validation-toast"
          role="alert"
          aria-live="assertive"
        >
          <span>{importError}</span>
          <button
            type="button"
            className="alert-close"
            onClick={() => setImportError(null)}
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        multiple={activeMode === "queue"}
        hidden
        onChange={(event) => void handleImportFiles(event.target.files)}
      />
    </div>
  );
}
