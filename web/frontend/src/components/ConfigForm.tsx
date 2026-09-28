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

export function ConfigForm({
  initialConfig,
  onGenerateMap,
  onAddToQueue,
  isGenerating,
  activeMode,
  onSwitchMode,
  queueCount,
}: ConfigFormProps) {
  const [mapH, setMapH] = useState<number>(initialConfig?.MAP_H ?? 64);
  const [mapW, setMapW] = useState<number>(initialConfig?.MAP_W ?? 128);
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

  const [cleaningDirInfo, setCleaningDirInfo] = useState<{
    dir: string;
    fileCount: number;
    files: string[];
    onConfirm: () => void;
  } | null>(null);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);

  function getCurrentConfig(): SystemConfig {
    return {
      ...(initialConfig || {}),
      MAP_H: Number(mapH),
      MAP_W: Number(mapW),
      CONNECTIVITY: Number(connectivity),
      DEFAULT_REDUCTION_METHOD: reductionMethod,
      USE_INCREMENTAL_SOLVER: useIncremental,
      OUTPUT_DIR: outputDir.trim() || "output",
      MAP_DEFAULT_SEED: Number(initialConfig?.MAP_DEFAULT_SEED ?? 42),
      DEFAULT_PLANNER: String(initialConfig?.DEFAULT_PLANNER ?? "ASTAR"),
      DEFAULT_SOLVER: String(initialConfig?.DEFAULT_SOLVER ?? "HIGHS"),
      RHO_TERRAIN: Number(initialConfig?.RHO_TERRAIN ?? 1.0),
      RHO_OBSTACLE: Number(initialConfig?.RHO_OBSTACLE ?? 5.0),
      RHO_SLOPE: Number(initialConfig?.RHO_SLOPE ?? 10.0),
      MAX_ISP_ITERATIONS: Number(initialConfig?.MAX_ISP_ITERATIONS ?? 15),
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
    } catch {
      // ignore
    }
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
      // ignore
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
    } catch {
      // ignore
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
        <legend>1. Pipeline Configuration</legend>

        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="mapH">
              <span>Map Height</span>
              <span className="form-group-hint">4–1024 cells</span>
            </label>
            <input
              id="mapH"
              type="number"
              min={4}
              max={1024}
              value={mapH}
              onChange={(e) => setMapH(Number(e.target.value))}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="mapW">
              <span>Map Width</span>
              <span className="form-group-hint">4–1024 cells</span>
            </label>
            <input
              id="mapW"
              type="number"
              min={4}
              max={1024}
              value={mapW}
              onChange={(e) => setMapW(Number(e.target.value))}
              required
            />
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
