import { useCallback, useEffect, useState } from "react";
import { AboutModal } from "./components/AboutModal";
import { ConfigForm } from "./components/ConfigForm";
import { QueuePanel } from "./components/QueuePanel";
import { ResultsView } from "./components/ResultsView";
import { RouteCanvas } from "./components/RouteCanvas";
import { formatReductionMethod } from "./utils/formatters";
import { Topbar } from "./components/Topbar";
import {
  fetchConfig,
  generateMap,
  importConfig,
  saveConfigurations,
  solveISP,
} from "./services/api";
import type {
  LastResult,
  MapData,
  QueueItem,
  SaveConfigurationItem,
  SystemConfig,
} from "./types";

function isSameMap(a?: SystemConfig | null, b?: SystemConfig | null): boolean {
  if (!a || !b) return false;
  return (
    Number(a.MAP_H) === Number(b.MAP_H) &&
    Number(a.MAP_W) === Number(b.MAP_W) &&
    Number(a.CONNECTIVITY) === Number(b.CONNECTIVITY) &&
    Number(a.MAP_DEFAULT_SEED) === Number(b.MAP_DEFAULT_SEED) &&
    Number(a.MAP_ELEVATION_SCALE ?? 2.0) ===
      Number(b.MAP_ELEVATION_SCALE ?? 2.0) &&
    Number(a.MAP_ELEVATION_FREQ ?? 0.06) ===
      Number(b.MAP_ELEVATION_FREQ ?? 0.06) &&
    Number(a.MAP_OBSTACLE_FREQ ?? 0.05) ===
      Number(b.MAP_OBSTACLE_FREQ ?? 0.05) &&
    Number(a.MAP_OBSTACLE_THRESHOLD ?? 0.85) ===
      Number(b.MAP_OBSTACLE_THRESHOLD ?? 0.85)
  );
}

function arePathsEqual(
  p1?: [number, number][],
  p2?: [number, number][],
): boolean {
  if (!p1 || !p2) return false;
  if (p1.length !== p2.length) return false;
  return p1.every(([r1, c1], i) => r1 === p2[i][0] && c1 === p2[i][1]);
}

export function App() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [activeTabMode, setActiveTabMode] = useState<"individual" | "queue">(
    "individual",
  );
  const [workflowMode, setWorkflowMode] = useState<"run" | "create">("run");
  const [configurationName, setConfigurationName] = useState<string>("");
  const [configurationDestination, setConfigurationDestination] =
    useState<string>("");
  const [pendingConfiguration, setPendingConfiguration] = useState<{
    name: string;
    destinationDir: string;
  } | null>(null);
  const [currentStep, setCurrentStep] = useState<
    "config" | "route_canvas" | "results"
  >("config");

  const [mapData, setMapData] = useState<MapData | null>(null);
  const [userPath, setUserPath] = useState<[number, number][]>([]);
  const [batchRouteFeedback, setBatchRouteFeedback] = useState<string | null>(
    null,
  );
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [cacheKey, setCacheKey] = useState<number>(() => Date.now());

  const [isGeneratingMap, setIsGeneratingMap] = useState<boolean>(false);
  const [isSolvingISP, setIsSolvingISP] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [runQueue, setRunQueue] = useState<QueueItem[]>([]);
  const [configurationQueue, setConfigurationQueue] = useState<QueueItem[]>([]);
  const queue = workflowMode === "create" ? configurationQueue : runQueue;
  function setQueue(
    update: QueueItem[] | ((previous: QueueItem[]) => QueueItem[]),
  ) {
    const updateQueue = workflowMode === "create" ? setConfigurationQueue : setRunQueue;
    updateQueue(update);
  }
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [batchReviewIndex, setBatchReviewIndex] = useState<number>(0);
  const [activeBatchResultIndex, setActiveBatchResultIndex] =
    useState<number>(0);
  const [interactiveQueueMode, setInteractiveQueueMode] =
    useState<boolean>(true);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);

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

  const handleGenerateMap = useCallback(
    async (
      targetConfig: SystemConfig,
      targetName?: string,
      destinationDir?: string,
    ) => {
      setIsBatchMode(false);
      setIsGeneratingMap(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      setPendingConfiguration(
        workflowMode === "create" && targetName && destinationDir
          ? { name: targetName, destinationDir }
          : null,
      );
      try {
        const generated = await generateMap(
          targetConfig,
          workflowMode === "run",
        );
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
    },
    [workflowMode],
  );

  const handleImportConfig = useCallback(
    async (
      parsedJson: Record<string, unknown>,
      targetName?: string,
      destinationDir?: string,
    ) => {
      setIsBatchMode(false);
      setIsGeneratingMap(true);
      setErrorMessage(null);
      setPendingConfiguration(
        workflowMode === "create" && targetName && destinationDir
          ? { name: targetName, destinationDir }
          : null,
      );
      try {
        const imported = await importConfig(
          parsedJson,
          workflowMode === "run",
        );
        setMapData(imported);
        setUserPath(
          imported.user_path || imported.auto_path || [imported.start],
        );
        setConfig(imported.config);
        setCurrentStep("route_canvas");
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Error importing configuration",
        );
      } finally {
        setIsGeneratingMap(false);
      }
    },
    [workflowMode],
  );

  const handleImportBatchConfigs = useCallback(
    async (
      items: { name: string; data: Record<string, unknown> }[],
    ) => {
      if (items.length === 0) return;
      setIsGeneratingMap(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      let importedCount = 0;
      const errors: string[] = [];
      const newQueueItems: QueueItem[] = [];

      for (const item of items) {
        try {
          const imported = await importConfig(item.data, true);
          const queueItem: QueueItem = {
            id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            config: imported.config,
            configurationName:
              workflowMode === "create" ? item.name : undefined,
            status: "awaiting_route",
            mapData: imported,
            userPath:
              imported.user_path || imported.auto_path || [imported.start],
          };
          newQueueItems.push(queueItem);
          importedCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          errors.push(`${item.name}.json: ${msg}`);
        }
      }

      if (newQueueItems.length > 0) {
        const updateQueue =
          workflowMode === "create" ? setConfigurationQueue : setRunQueue;
        updateQueue((prev) => [...prev, ...newQueueItems]);
        setSuccessMessage(
          `Imported ${importedCount} configuration${importedCount > 1 ? "s" : ""} to batch queue.`,
        );
      }

      if (errors.length > 0) {
        setErrorMessage(
          `Failed to import ${errors.length} file(s): ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "..." : ""}`,
        );
      }

      setIsGeneratingMap(false);
    },
    [workflowMode],
  );

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

  function handleAddToQueue(
    newConfig: SystemConfig,
    targetName?: string,
    destinationDir?: string,
  ) {
    if (workflowMode === "create" && destinationDir) {
      setConfigurationDestination(destinationDir);
    }
    const newItem: QueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      config: newConfig,
      configurationName: workflowMode === "create" ? targetName : undefined,
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
        firstMap = await generateMap(firstItem.config, workflowMode === "run");
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
        const newMap = await generateMap(
          targetItem.config,
          workflowMode === "run",
        );
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

  async function handleSaveSingleConfiguration() {
    if (!mapData || !pendingConfiguration) return;
    setIsGeneratingMap(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await saveConfigurations({
        destination_dir: pendingConfiguration.destinationDir,
        configurations: [
          {
            name: pendingConfiguration.name,
            config: mapData.config,
            start: mapData.start,
            goal: mapData.goal,
            user_path: userPath,
          },
        ],
      });
      setSuccessMessage(`Configuration saved to ${result.saved_files[0]}`);
      setPendingConfiguration(null);
      setCurrentStep("config");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error saving configuration",
      );
    } finally {
      setIsGeneratingMap(false);
    }
  }

  async function handleSaveBatchConfigurations(finalQueue: QueueItem[]) {
    if (!configurationDestination.trim()) {
      setErrorMessage("Output directory is required.");
      return;
    }
    if (
      finalQueue.some(
        (item) =>
          !item.configurationName?.trim() ||
          !item.mapData ||
          !item.userPath?.length,
      )
    ) {
      setErrorMessage("Every batch item must have a name, map, and route.");
      return;
    }

    setIsGeneratingMap(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const configurations: SaveConfigurationItem[] = finalQueue.map((item) => ({
        name: item.configurationName as string,
        config: item.config,
        start: (item.mapData as MapData).start,
        goal: (item.mapData as MapData).goal,
        user_path: item.userPath as [number, number][],
      }));
      const result = await saveConfigurations({
        destination_dir: configurationDestination,
        configurations,
      });
      setQueue((previous) =>
        previous.map((item) => ({ ...item, status: "saved" })),
      );
      setSuccessMessage(
        `Saved ${result.saved_files.length} configurations to ${configurationDestination}`,
      );
      setIsBatchMode(false);
      setCurrentStep("config");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error saving batch configurations",
      );
    } finally {
      setIsGeneratingMap(false);
    }
  }

  async function handleNextBatchMap() {
    if (workflowMode === "create") {
      const finalQueue = queue.map((item, index) =>
        index === batchReviewIndex
          ? {
              ...item,
              mapData: mapData ? { ...mapData, config: item.config } : item.mapData,
              userPath,
              status: "awaiting_route" as const,
            }
          : item,
      );
      setQueue(finalQueue);
      if (batchReviewIndex < queue.length - 1) {
        await handleSwitchBatchMap(batchReviewIndex + 1);
      } else {
        await handleSaveBatchConfigurations(finalQueue);
      }
      return;
    }
    if (batchReviewIndex < queue.length - 1) {
      await handleSwitchBatchMap(batchReviewIndex + 1);
    } else {
      handleExecuteBatch();
    }
  }

  function handlePrevBatchMap() {
    if (batchReviewIndex > 0) {
      handleSwitchBatchMap(batchReviewIndex - 1);
    }
  }

  function handleReuseRouteFrom(sourceIdx: number) {
    const sourceItem = queue[sourceIdx];
    const sourcePath = sourceItem?.userPath;
    if (sourcePath && sourcePath.length > 0) {
      const copy = [...sourcePath];
      setUserPath(copy);
      setQueue((prev) =>
        prev.map((it, idx) =>
          idx === batchReviewIndex
            ? {
                ...it,
                userPath: copy,
                mapData: mapData
                  ? { ...mapData, config: it.config }
                  : it.mapData,
                status: "awaiting_route",
              }
            : it,
        ),
      );
      setBatchRouteFeedback(`Route copied from Map #${sourceIdx + 1}`);
      setTimeout(() => setBatchRouteFeedback(null), 3500);
    }
  }

  function handleApplyRouteToAllMatching(targetIndices: number[]) {
    if (userPath.length === 0) return;
    const currentPathCopy = [...userPath];
    setQueue((prev) =>
      prev.map((it, idx) =>
        targetIndices.includes(idx) || idx === batchReviewIndex
          ? {
              ...it,
              userPath: currentPathCopy,
              mapData: mapData
                ? { ...mapData, config: it.config }
                : it.mapData,
              status: "awaiting_route",
            }
          : it,
      ),
    );
    setBatchRouteFeedback(
      `Route applied to all ${targetIndices.length + 1} identical maps`,
    );
    setTimeout(() => setBatchRouteFeedback(null), 3500);
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
      if (item.mapData) {
        setMapData(item.mapData);
        setUserPath(
          item.userPath || item.mapData.auto_path || [item.mapData.start],
        );
      }
      setCacheKey(Date.now());
      setCurrentStep("results");
    }
  }

  return (
    <div className="app-layout">
      <Topbar
        currentStep={currentStep}
        onSelectStep={setCurrentStep}
        hasMapData={Boolean(mapData)}
        hasResults={Boolean(lastResult || (isBatchMode && queue.length > 0))}
        activeReductionMethod={
          isBatchMode && queue[activeBatchResultIndex]
            ? queue[activeBatchResultIndex].config.DEFAULT_REDUCTION_METHOD
            : mapData?.config.DEFAULT_REDUCTION_METHOD ||
              config?.DEFAULT_REDUCTION_METHOD
        }
        isIncrementalActive={
          isBatchMode && queue[activeBatchResultIndex]
            ? queue[activeBatchResultIndex].config.USE_INCREMENTAL_SOLVER
            : mapData?.config.USE_INCREMENTAL_SOLVER ||
              config?.USE_INCREMENTAL_SOLVER
        }
        onOpenAbout={() => setIsAboutOpen(true)}
      />

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
        {successMessage && (
          <div className="queue-banner" role="status">
            <span className="alert-text">{successMessage}</span>
            <button
              type="button"
              className="alert-close"
              onClick={() => setSuccessMessage(null)}
              aria-label="Dismiss success message"
            >
              &times;
            </button>
          </div>
        )}

        {currentStep === "config" && (
          <div key="step-config" className="step-container config-step">
            <ConfigForm
              key={config ? "server-config" : "fallback-config"}
              initialConfig={config}
              onGenerateMap={handleGenerateMap}
              onAddToQueue={handleAddToQueue}
              onImportConfig={handleImportConfig}
              onImportBatchConfigs={handleImportBatchConfigs}
              isGenerating={isGeneratingMap}
              workflowMode={workflowMode}
              onSwitchWorkflowMode={(mode) => {
                setWorkflowMode(mode);
                setIsBatchMode(false);
                setErrorMessage(null);
              }}
              activeMode={activeTabMode}
              onSwitchMode={setActiveTabMode}
              queueCount={queue.length}
              queue={queue}
              configurationName={configurationName}
              onConfigurationNameChange={setConfigurationName}
              configurationDestination={configurationDestination}
              onConfigurationDestinationChange={setConfigurationDestination}
            />

            {activeTabMode === "queue" && (
              <div className="queue-tab-content">
                <QueuePanel
                  queue={queue}
                  workflowMode={workflowMode}
                  currentIndex={batchReviewIndex}
                  isProcessing={isSolvingISP || isGeneratingMap}
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

        {currentStep === "route_canvas" && mapData && (
          <div key="step-route_canvas" className="step-container route-step">
            <RouteCanvas
              mapData={mapData}
              userPath={userPath}
              onPathChange={setUserPath}
              onSolve={
                workflowMode === "create"
                  ? isBatchMode
                    ? handleNextBatchMap
                    : handleSaveSingleConfiguration
                  : isBatchMode
                    ? handleNextBatchMap
                    : handleSingleSolve
              }
              isSolving={isSolvingISP || isGeneratingMap}
              onCancel={() => {
                setIsBatchMode(false);
                setCurrentStep("config");
              }}
              busyButtonText={
                workflowMode === "create"
                  ? "Saving Configuration..."
                  : "Solving ISP..."
              }
              solveButtonText={
                workflowMode === "create"
                  ? isBatchMode
                    ? batchReviewIndex < queue.length - 1
                      ? `Save Route & Next Item (${batchReviewIndex + 2}/${queue.length})`
                      : "Save Batch Configurations"
                    : "Save Configuration"
                  : isBatchMode
                    ? batchReviewIndex < queue.length - 1
                      ? `Save Route & Next Map (${batchReviewIndex + 2}/${queue.length}) →`
                      : `Solve Batch (${queue.length} Runs)`
                    : "Solve ISP"
              }
              onPrevMap={
                isBatchMode && batchReviewIndex > 0
                  ? handlePrevBatchMap
                  : undefined
              }
              batchStepper={
                isBatchMode && queue.length > 1 ? (() => {
                  const currentBatchItem = queue[batchReviewIndex];
                  const matchingBatchIndices = currentBatchItem
                    ? queue
                        .map((item, idx) => ({ item, idx }))
                        .filter(
                          ({ idx, item }) =>
                            idx !== batchReviewIndex &&
                            isSameMap(item.config, currentBatchItem.config),
                        )
                    : [];

                  const isCurrentRouteComplete =
                    userPath.length > 0 &&
                    userPath[userPath.length - 1][0] === mapData.goal[0] &&
                    userPath[userPath.length - 1][1] === mapData.goal[1];

                  const matchingRunWithRoute = matchingBatchIndices.find(
                    ({ item }) => {
                      const itemGoal = item.mapData?.goal || mapData.goal;
                      return (
                        item.userPath &&
                        item.userPath.length > 0 &&
                        item.userPath[item.userPath.length - 1][0] ===
                          itemGoal[0] &&
                        item.userPath[item.userPath.length - 1][1] ===
                          itemGoal[1]
                      );
                    },
                  );

                  const areAllMatchingSynced =
                    matchingBatchIndices.length > 0 &&
                    isCurrentRouteComplete &&
                    matchingBatchIndices.every(({ item }) =>
                      arePathsEqual(userPath, item.userPath),
                    );

                  const isSyncedWithSource = Boolean(
                    matchingRunWithRoute &&
                      arePathsEqual(userPath, matchingRunWithRoute.item.userPath),
                  );

                  return (
                    <div className="batch-stepper-bar">
                      <div className="batch-stepper-label">
                        <span className="batch-stepper-title">
                          {workflowMode === "create"
                            ? `Configuration Route Setup, Item ${batchReviewIndex + 1} of ${queue.length}`
                            : `Batch Route Setup - Map ${batchReviewIndex + 1} of ${queue.length}`}
                        </span>
                        <span className="batch-stepper-sub">
                          {workflowMode === "create"
                            ? "Define a route for each configuration before saving the batch."
                            : "Define custom routes for all maps in the batch before solving."}
                        </span>
                      </div>

                      <div className="batch-steps-list">
                        {queue.map((item, idx) => {
                          const isActive = idx === batchReviewIndex;
                          const itemGoal =
                            item.mapData?.goal ||
                            (isSameMap(item.config, mapData.config)
                              ? mapData.goal
                              : undefined);
                          const isItemConnected =
                            idx === batchReviewIndex
                              ? isCurrentRouteComplete
                              : Boolean(
                                  item.userPath &&
                                    item.userPath.length > 0 &&
                                    itemGoal &&
                                    item.userPath[item.userPath.length - 1][0] ===
                                      itemGoal[0] &&
                                    item.userPath[item.userPath.length - 1][1] ===
                                      itemGoal[1],
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
                                {workflowMode === "create"
                                  ? `${item.configurationName || `Item ${idx + 1}`} (${item.config.MAP_H}x${item.config.MAP_W})`
                                  : `Map ${idx + 1} (${item.config.MAP_H}x${item.config.MAP_W})`}
                              </span>
                              <span
                                className={`batch-step-status-pill ${
                                  isItemConnected ? "ready" : "pending"
                                }`}
                              >
                                {isItemConnected ? "Ready" : "Pending"}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {matchingBatchIndices.length > 0 && (
                        <div
                          className={`batch-identical-maps-banner ${
                            areAllMatchingSynced ? "is-synced" : ""
                          }`}
                        >
                          <div className="identical-maps-top-row">
                            <div className="identical-maps-info">
                              <span className="identical-maps-title">
                                {areAllMatchingSynced
                                  ? "Route Synchronized Across All Identical Maps"
                                  : "Identical Map Geometry Detected"}
                              </span>
                              <span className="identical-maps-desc">
                                {areAllMatchingSynced
                                  ? `All ${matchingBatchIndices.length + 1} identical maps in this batch share this exact verified route (${userPath.length} steps).`
                                  : matchingRunWithRoute && !isSyncedWithSource
                                    ? `Map #${matchingRunWithRoute.idx + 1} has a verified route (${matchingRunWithRoute.item.userPath?.length} steps). You can copy it with 1 click, or keep a custom route.`
                                    : `Maps ${[batchReviewIndex + 1, ...matchingBatchIndices.map((m) => m.idx + 1)].sort().map((n) => `#${n}`).join(", ")} share this exact terrain & obstacles. You can draw once and apply to all.`}
                              </span>
                            </div>

                            {batchRouteFeedback && (
                              <div className="identical-maps-toast">
                                {batchRouteFeedback}
                              </div>
                            )}
                          </div>

                          <div className="identical-maps-actions">
                            {matchingRunWithRoute && !isSyncedWithSource && (
                              <button
                                type="button"
                                className="btn btn-vibrant btn-sm"
                                onClick={() =>
                                  handleReuseRouteFrom(matchingRunWithRoute.idx)
                                }
                                title={`Copy route from Map #${matchingRunWithRoute.idx + 1}`}
                              >
                                Copy Route from Map #{matchingRunWithRoute.idx + 1}
                              </button>
                            )}

                            <button
                              type="button"
                              className={`btn ${
                                areAllMatchingSynced
                                  ? "btn-ghost"
                                  : matchingRunWithRoute && !isSyncedWithSource
                                    ? "btn-secondary"
                                    : "btn-vibrant"
                              } btn-sm`}
                              onClick={() =>
                                handleApplyRouteToAllMatching(
                                  matchingBatchIndices.map((m) => m.idx),
                                )
                              }
                              disabled={!isCurrentRouteComplete}
                              title="Apply current route to all matching runs"
                            >
                              {areAllMatchingSynced
                                ? "Re-apply to All Identical Maps"
                                : `Apply Route to All ${matchingBatchIndices.length + 1} Identical Maps`}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })() : undefined
              }
            />
          </div>
        )}

        {currentStep === "results" && (
          <div key="step-results" className="step-container results-step">
            <ResultsView
              result={lastResult}
              mapData={
                isBatchMode
                  ? queue[activeBatchResultIndex]?.mapData || null
                  : mapData
              }
              userPath={
                isBatchMode
                  ? queue[activeBatchResultIndex]?.userPath || []
                  : userPath
              }
              artifacts={artifacts}
              cacheKey={cacheKey}
              config={mapData?.config || config}
              mapImageUrl={
                isBatchMode
                  ? queue[activeBatchResultIndex]?.mapData?.map_image_url
                  : mapData?.map_image_url
              }
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
                  workflowMode={workflowMode}
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
            {(() => {
              const activeConfig =
                isBatchMode && queue[activeBatchResultIndex]
                  ? queue[activeBatchResultIndex].config
                  : mapData?.config || config;
              if (!activeConfig) return null;
              const reduction = formatReductionMethod(
                activeConfig.DEFAULT_REDUCTION_METHOD ||
                  (activeConfig.GRAPH_REDUCTION_METHOD as string),
              );
              const solverMode = activeConfig.USE_INCREMENTAL_SOLVER
                ? "Iterative / Incremental MILP"
                : "Standard Monolithic MILP";
              const astarScope =
                activeConfig.USE_INCREMENTAL_SOLVER &&
                activeConfig.DEFAULT_REDUCTION_METHOD !== "NONE"
                  ? activeConfig.INCREMENTAL_ASTAR_SCOPE === "SUBGRAPH"
                    ? "Reduced Subgraph"
                    : "Global Grid"
                  : null;
              const h = activeConfig.MAP_H ?? 20;
              const w = activeConfig.MAP_W ?? 20;
              const seed = activeConfig.MAP_DEFAULT_SEED ?? 42;
              return (
                <div className="loading-params-summary">
                  <span className="loading-param-chip">
                    Reduction Method: {reduction}
                  </span>
                  <span className="loading-param-chip">
                    Solver Mode: {solverMode}
                  </span>
                  {astarScope && (
                    <span className="loading-param-chip">
                      A* Scope: {astarScope}
                    </span>
                  )}
                  <span className="loading-param-chip">
                    Grid Dimension: {w}×{h} (Seed: {seed})
                  </span>
                </div>
              );
            })()}
            <p className="loading-overlay-desc">
              Solving ISP formulation via Mixed-Integer Linear Programming
              (MILP). Because the inverse problem under discrete terrain
              attributes is NP-hard, solving large grids or runs without graph
              reduction explores a large combinatorial space and may take
              several minutes depending on hardware. Please wait...
            </p>
            <div className="loading-elapsed-timer">
              Elapsed time: <strong>{elapsedTime}s</strong>
            </div>
          </div>
        </div>
      )}

      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </div>
  );
}

export default App;
