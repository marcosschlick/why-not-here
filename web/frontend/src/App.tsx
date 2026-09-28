import { useCallback, useEffect, useState } from "react";
import { ConfigForm } from "./components/ConfigForm";
import { QueuePanel } from "./components/QueuePanel";
import { ResultsView } from "./components/ResultsView";
import { RouteCanvas } from "./components/RouteCanvas";
import { fetchConfig, generateMap, solveISP } from "./services/api";
import type { LastResult, MapData, QueueItem, SystemConfig } from "./types";

export function App() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [activeTabMode, setActiveTabMode] = useState<"individual" | "queue">(
    "individual",
  );
  const [currentStep, setCurrentStep] = useState<
    "config" | "route_canvas" | "results"
  >("config");

  const [mapData, setMapData] = useState<MapData | null>(null);
  const [userPath, setUserPath] = useState<[number, number][]>([]);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [cacheKey, setCacheKey] = useState<number>(() => Date.now());

  const [isGeneratingMap, setIsGeneratingMap] = useState<boolean>(false);
  const [isSolvingISP, setIsSolvingISP] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [batchReviewIndex, setBatchReviewIndex] = useState<number>(0);
  const [activeBatchResultIndex, setActiveBatchResultIndex] =
    useState<number>(0);
  const [interactiveQueueMode, setInteractiveQueueMode] =
    useState<boolean>(true);

  useEffect(() => {
    if (!isSolvingISP) return;
    const timer = window.setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isSolvingISP]);

  useEffect(() => {
    async function loadInitial() {
      try {
        const initialConfig = await fetchConfig();
        setConfig(initialConfig);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Failed to load server configuration",
        );
      }
    }
    loadInitial();
  }, []);

  const handleGenerateMap = useCallback(async (targetConfig: SystemConfig) => {
    setIsBatchMode(false);
    setIsGeneratingMap(true);
    setErrorMessage(null);
    try {
      const generated = await generateMap(targetConfig);
      setMapData(generated);
      setUserPath(generated.auto_path || [generated.start]);
      setCurrentStep("route_canvas");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error generating map",
      );
    } finally {
      setIsGeneratingMap(false);
    }
  }, []);

  const handleSingleSolve = useCallback(async () => {
    if (!mapData) return;
    setElapsedTime(0);
    setIsSolvingISP(true);
    setErrorMessage(null);

    try {
      const response = await solveISP(userPath, mapData.config);
      setLastResult(response.result);
      setArtifacts(response.artifacts);
      setCacheKey(Date.now());
      setCurrentStep("results");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error executing ISP solver",
      );
    } finally {
      setIsSolvingISP(false);
    }
  }, [mapData, userPath]);

  function handleAddToQueue(newConfig: SystemConfig) {
    const newItem: QueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      config: newConfig,
      status: "pending",
    };
    setQueue((prev) => [...prev, newItem]);
  }

  function handleRemoveQueueItem(id: string) {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }

  function handleClearQueue() {
    setQueue([]);
    setIsBatchMode(false);
    setBatchReviewIndex(0);
  }

  async function handleStartBatchReview() {
    if (queue.length === 0) return;
    setIsBatchMode(true);
    setBatchReviewIndex(0);
    setIsGeneratingMap(true);
    setErrorMessage(null);

    try {
      const firstItem = queue[0];
      let firstMap = firstItem.mapData;
      let initialPath = firstItem.userPath;

      if (!firstMap) {
        firstMap = await generateMap(firstItem.config);
        initialPath = initialPath || firstMap.auto_path || [firstMap.start];
        setQueue((prev) =>
          prev.map((it, idx) =>
            idx === 0
              ? {
                  ...it,
                  mapData: firstMap,
                  userPath: initialPath,
                  status: "awaiting_route",
                }
              : it,
          ),
        );
      }

      setMapData(firstMap);
      setUserPath(initialPath || [firstMap.start]);
      setCurrentStep("route_canvas");
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Error generating initial batch map",
      );
      setIsBatchMode(false);
    } finally {
      setIsGeneratingMap(false);
    }
  }

  async function handleSwitchBatchMap(targetIndex: number) {
    if (
      targetIndex < 0 ||
      targetIndex >= queue.length ||
      targetIndex === batchReviewIndex
    ) {
      return;
    }

    const updatedQueue = queue.map((it, idx) =>
      idx === batchReviewIndex ? { ...it, userPath } : it,
    );
    setQueue(updatedQueue);

    setBatchReviewIndex(targetIndex);
    const targetItem = updatedQueue[targetIndex];

    if (targetItem.mapData) {
      setMapData(targetItem.mapData);
      setUserPath(
        targetItem.userPath ||
          targetItem.mapData.auto_path || [targetItem.mapData.start],
      );
    } else {
      setIsGeneratingMap(true);
      try {
        const newMap = await generateMap(targetItem.config);
        const initialPath = targetItem.userPath ||
          newMap.auto_path || [newMap.start];

        setQueue((prev) =>
          prev.map((it, idx) =>
            idx === targetIndex
              ? {
                  ...it,
                  mapData: newMap,
                  userPath: initialPath,
                  status: "awaiting_route",
                }
              : it,
          ),
        );
        setMapData(newMap);
        setUserPath(initialPath);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : `Error generating map for item ${targetIndex + 1}`,
        );
      } finally {
        setIsGeneratingMap(false);
      }
    }
  }

  function handleNextBatchMap() {
    if (batchReviewIndex < queue.length - 1) {
      handleSwitchBatchMap(batchReviewIndex + 1);
    } else {
      handleExecuteBatch();
    }
  }

  function handlePrevBatchMap() {
    if (batchReviewIndex > 0) {
      handleSwitchBatchMap(batchReviewIndex - 1);
    }
  }

  async function handleExecuteBatch() {
    const finalQueue = queue.map((it, idx) =>
      idx === batchReviewIndex ? { ...it, userPath } : it,
    );
    setQueue(finalQueue);

    setElapsedTime(0);
    setIsSolvingISP(true);
    setErrorMessage(null);
    setCurrentStep("results");
    setActiveBatchResultIndex(0);

    for (let i = 0; i < finalQueue.length; i++) {
      const item = finalQueue[i];
      setActiveBatchResultIndex(i);

      setQueue((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: "solving" } : it)),
      );

      try {
        const effectivePath = item.userPath || item.mapData?.auto_path || [];
        const response = await solveISP(effectivePath, item.config);

        setQueue((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: "completed",
                  result: response.result,
                  artifacts: response.artifacts,
                }
              : it,
          ),
        );

        if (i === 0) {
          setLastResult(response.result);
          setArtifacts(response.artifacts);
        }
        setCacheKey(Date.now());
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Batch execution failed";
        setQueue((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: "failed", error: msg } : it,
          ),
        );
      }
    }
    setIsSolvingISP(false);
  }

  function handleSelectQueueItem(item: QueueItem) {
    if (item.result) {
      const idx = queue.findIndex((q) => q.id === item.id);
      if (idx >= 0) {
        setActiveBatchResultIndex(idx);
      }
      setLastResult(item.result);
      setArtifacts(item.artifacts || []);
      setCacheKey(Date.now());
      setCurrentStep("results");
    }
  }

  return (
    <div className="app-layout">
      <header className="app-topbar">
        <div className="topbar-brand">
          <div className="brand-text">
            <h1>Trajectory Planning &amp; ISP</h1>
            <span className="brand-tagline">
              Iterative Semantic Pathing &bull; Closed-Loop Solver
            </span>
          </div>
        </div>

        <nav className="topbar-nav" role="tablist" aria-label="Workflow Steps">
          <button
            type="button"
            role="tab"
            aria-selected={currentStep === "config"}
            className={`nav-tab ${currentStep === "config" ? "active" : ""}`}
            onClick={() => setCurrentStep("config")}
          >
            <span className="nav-step-num">1</span>
            <span>Configuration</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={currentStep === "route_canvas"}
            className={`nav-tab ${currentStep === "route_canvas" ? "active" : ""}`}
            onClick={() => mapData && setCurrentStep("route_canvas")}
            disabled={!mapData}
          >
            <span className="nav-step-num">2</span>
            <span>Route Definition</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={currentStep === "results"}
            className={`nav-tab ${currentStep === "results" ? "active" : ""}`}
            onClick={() =>
              (lastResult || (isBatchMode && queue.length > 0)) &&
              setCurrentStep("results")
            }
            disabled={!lastResult && !(isBatchMode && queue.length > 0)}
          >
            <span className="nav-step-num">3</span>
            <span>Results &amp; Metrics</span>
          </button>
        </nav>
      </header>

      <main className="main-content-wrapper">
        {errorMessage && (
          <div className="alert-banner">
            <span className="alert-icon">&times;</span>
            <span className="alert-text">{errorMessage}</span>
            <button
              type="button"
              className="alert-close"
              onClick={() => setErrorMessage(null)}
            >
              &times;
            </button>
          </div>
        )}

        {currentStep === "config" && (
          <div className="step-container config-step">
            <ConfigForm
              initialConfig={config}
              onGenerateMap={handleGenerateMap}
              onAddToQueue={handleAddToQueue}
              isGenerating={isGeneratingMap}
              activeMode={activeTabMode}
              onSwitchMode={setActiveTabMode}
              queueCount={queue.length}
            />

            {activeTabMode === "queue" && (
              <QueuePanel
                queue={queue}
                currentIndex={batchReviewIndex}
                isProcessing={isSolvingISP || isGeneratingMap}
                interactiveMode={interactiveQueueMode}
                onToggleInteractiveMode={setInteractiveQueueMode}
                onRemoveItem={handleRemoveQueueItem}
                onClearQueue={handleClearQueue}
                onStartQueue={handleStartBatchReview}
                onSelectItem={handleSelectQueueItem}
              />
            )}
          </div>
        )}

        {currentStep === "route_canvas" && mapData && (
          <div className="step-container route-step">
            <RouteCanvas
              mapData={mapData}
              userPath={userPath}
              onPathChange={setUserPath}
              onSolve={isBatchMode ? handleNextBatchMap : handleSingleSolve}
              isSolving={isSolvingISP || isGeneratingMap}
              onCancel={() => setCurrentStep("config")}
              solveButtonText={
                isBatchMode
                  ? batchReviewIndex < queue.length - 1
                    ? `Save Route & Next Map (${batchReviewIndex + 2}/${queue.length}) →`
                    : `Solve Batch (${queue.length} Runs)`
                  : "3. Solve ISP"
              }
              onPrevMap={
                isBatchMode && batchReviewIndex > 0
                  ? handlePrevBatchMap
                  : undefined
              }
              batchStepper={
                isBatchMode && queue.length > 1 ? (
                  <div className="batch-stepper-bar">
                    <div className="batch-stepper-label">
                      <span className="batch-stepper-title">
                        Batch Route Setup — Map {batchReviewIndex + 1} of{" "}
                        {queue.length}
                      </span>
                      <span className="batch-stepper-sub">
                        Define custom routes for all maps in the batch before
                        solving.
                      </span>
                    </div>

                    <div className="batch-steps-list">
                      {queue.map((item, idx) => {
                        const isActive = idx === batchReviewIndex;
                        const isCurrentConnected =
                          idx === batchReviewIndex
                            ? userPath.length > 0 &&
                              userPath[userPath.length - 1][0] ===
                                mapData.goal[0] &&
                              userPath[userPath.length - 1][1] ===
                                mapData.goal[1]
                            : Boolean(
                                item.userPath &&
                                item.mapData &&
                                item.userPath.length > 0 &&
                                item.userPath[item.userPath.length - 1][0] ===
                                  item.mapData.goal[0] &&
                                item.userPath[item.userPath.length - 1][1] ===
                                  item.mapData.goal[1],
                              );

                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`batch-step-btn ${
                              isActive ? "active" : ""
                            }`}
                            onClick={() => handleSwitchBatchMap(idx)}
                            disabled={isGeneratingMap || isSolvingISP}
                          >
                            <span>
                              Map {idx + 1} ({item.config.MAP_H}x
                              {item.config.MAP_W})
                            </span>
                            <span
                              className={`batch-step-status-pill ${
                                isCurrentConnected ? "ready" : "pending"
                              }`}
                            >
                              {isCurrentConnected ? "Ready" : "Pending"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : undefined
              }
            />
          </div>
        )}

        {currentStep === "results" && (
          <div className="step-container results-step">
            <ResultsView
              result={lastResult}
              artifacts={artifacts}
              cacheKey={cacheKey}
              onNewRun={() => {
                setIsBatchMode(false);
                setCurrentStep("config");
              }}
              batchQueue={isBatchMode && queue.length > 1 ? queue : undefined}
              activeBatchIndex={activeBatchResultIndex}
              onSelectBatchIndex={(idx) => {
                setActiveBatchResultIndex(idx);
                if (queue[idx]?.result) {
                  setLastResult(queue[idx].result!);
                  setArtifacts(queue[idx].artifacts || []);
                }
              }}
              elapsedTime={elapsedTime}
            />

            {queue.length > 0 && !isBatchMode && (
              <div className="queue-results-summary">
                <QueuePanel
                  queue={queue}
                  currentIndex={batchReviewIndex}
                  isProcessing={isSolvingISP}
                  interactiveMode={interactiveQueueMode}
                  onToggleInteractiveMode={setInteractiveQueueMode}
                  onRemoveItem={handleRemoveQueueItem}
                  onClearQueue={handleClearQueue}
                  onStartQueue={handleStartBatchReview}
                  onSelectItem={handleSelectQueueItem}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {isSolvingISP && !isBatchMode && (
        <div className="loading-overlay-backdrop">
          <div className="loading-overlay-card">
            <div className="loading-spinner" />
            <h3>Solving ISP Model...</h3>
            <p className="loading-overlay-desc">
              Formulating and solving mixed-integer linear programming (MILP).
              For large grids or unreduced graphs, this optimization may take
              between 30 seconds and a few minutes. Please wait...
            </p>
            <div className="loading-elapsed-timer">
              Elapsed time: <strong>{elapsedTime}s</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
