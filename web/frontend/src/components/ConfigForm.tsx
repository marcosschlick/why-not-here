import { useEffect, useRef, useState } from "react";
import { fetchMapProfiles } from "../services/api";
import type { MapProfile, SystemConfig } from "../types";

const reductionDescriptions: Record<string, string> = {
  NONE: "Uses the full grid graph without reduction.",
  BBOX: "Keeps the smallest rectangle containing the optimal and desired paths.",
  FLOODFILL: "Keeps the optimal and desired paths and the region between them.",
  SPARSIFIED: "Contracts eligible chains within the rectangle containing both paths.",
  PATH_ONLY: "Keeps the nodes and consecutive edges of the optimal and desired paths.",
};

interface ConfigFormProps {
  benchmark: boolean;
  onBenchmarkChange: (enabled: boolean) => void;
  onBeforeGenerate?: (action: () => void) => void;
  onDraftChange: (config: SystemConfig) => void;
  initialConfig: SystemConfig | null;
  onGenerateMap: (config: SystemConfig, benchmark: boolean) => void;
  onAddToQueue: (config: SystemConfig, benchmark: boolean) => Promise<number>;
  onImportConfig?: (data: Record<string, unknown>, benchmark: boolean) => void;
  onImportBatchConfigs?: (
    configs: {
      name: string;
      data: Record<string, unknown>;
    }[],
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
  benchmark,
  onBenchmarkChange,
  onBeforeGenerate,
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
  const [solver, setSolver] = useState<string>(
    initialConfig?.DEFAULT_SOLVER ?? "HIGHS",
  );
  const [timeBudget, setTimeBudget] = useState(
    initialConfig?.ISP_TIME_BUDGET_SEC ?? 1800,
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
      DEFAULT_SOLVER: solver,
      ISP_TIME_BUDGET_SEC: Number(timeBudget),
      ISP_MODEL: "NORMAL",
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
      onGenerateMap(getCurrentConfig(), benchmark);
    };
    if (onBeforeGenerate) onBeforeGenerate(generate);
    else generate();
  }
  async function handleAddQueue() {
    const count = await onAddToQueue(getCurrentConfig(), benchmark);
    if (!count) return;
    setFeedback(
      `${count} ${workflowMode === "create" ? "configuration(s)" : "execution(s)"} added to queue`,
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
      if (activeMode === "queue") onImportBatchConfigs?.(items, benchmark);
      else onImportConfig?.(items[0].data, benchmark);
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
    <div className="config-card">
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
                  aria-describedby="reduction-description"
                  disabled={benchmark}
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
                <span id="reduction-description" className="benchmark-description">
                  {reductionDescriptions[reductionMethod]}
                </span>
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
                    disabled={benchmark}
                    role="switch"
                    aria-checked={useIncremental}
                    aria-describedby="incremental-description"
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
                <span id="incremental-description" className="benchmark-description">
                  Incremental + None runs three scenarios per map and route outside benchmark.
                </span>
              </div>
            </div>
            <div className="strategy-column">
              <div className="form-group">
                <label htmlFor="incrementalAstarScope">
                  <span>Incremental A* Scope</span>
                  <span className="form-group-hint">
                    Competing paths search
                  </span>
                </label>
                <select
                  id="incrementalAstarScope"
                  aria-describedby="incremental-scope-description"
                  value={incrementalAstarScope}
                  onChange={(event) =>
                    setIncrementalAstarScope(event.target.value)
                  }
                  disabled={
                    benchmark || !useIncremental || reductionMethod === "NONE"
                  }
                >
                  <option value="GLOBAL">Global Grid</option>
                  <option value="SUBGRAPH">Reduced Subgraph</option>
                </select>
                <span id="incremental-scope-description" className="benchmark-description">
                  {benchmark
                    ? "Benchmark runs both scopes; None uses global search for both."
                    : incrementalAstarScope === "SUBGRAPH"
                      ? "Searches the subgraph and validates optimal candidates on the full grid."
                      : "Searches for competing paths across the full grid."}
                </span>
              </div>
            </div>
            <div className="strategy-column benchmark-setting">
              <div className="form-group">
                <label htmlFor="benchmarkToggle">
                  <span>Benchmark</span>
                  <span className="form-group-hint">
                    17 scenarios per map
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
                  {workflowMode === "create"
                    ? "Saves fifteen normal configurations per map; execution adds both Brandao scenarios."
                    : "Runs fifteen normal combinations plus Brandao monolithic and incremental without reduction."}
                </span>
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
                  Solver limits and map seed
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
                      <label htmlFor="ispTimeBudget">
                        <span>Scenario Time Budget (sec)</span>
                        <span className="form-group-hint">
                          Preparation through validation; cooperative deadline
                        </span>
                      </label>
                      <input
                        id="ispTimeBudget"
                        type="number"
                        min={0.001}
                        step="any"
                        value={timeBudget}
                        onChange={(event) =>
                          setTimeBudget(Number(event.target.value))
                        }
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
