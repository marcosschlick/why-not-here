import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AboutModal } from "./components/AboutModal";
import { ConfigForm } from "./components/ConfigForm";
import { QueuePanel } from "./components/QueuePanel";
import { ResultsView } from "./components/ResultsView";
import { RouteCanvas } from "./components/RouteCanvas";
import { validateDrawingRoute } from "./utils/validateRoute";
import { formatReductionMethod } from "./utils/formatters";
import { Topbar } from "./components/Topbar";
import { QuestionnaireAdmin } from "./components/QuestionnaireAdmin";
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
  const mapConfigKeys: (keyof SystemConfig)[] = [
    "MAP_H",
    "MAP_W",
    "CELL_SIZE",
    "CONNECTIVITY",
    "MAP_DEFAULT_SEED",
    "MAP_ELEVATION_SCALE",
    "MAP_ELEVATION_FREQ",
    "MAP_ELEVATION_OCTAVES",
    "MAP_ELEVATION_PERSISTENCE",
    "MAP_MOISTURE_FREQ",
    "MAP_MOISTURE_OCTAVES",
    "MAP_ROUGHNESS_FREQ",
    "MAP_ROUGHNESS_OCTAVES",
    "MAP_TERRAIN_THRESHOLDS",
    "MAP_ROUGHNESS_THRESHOLDS",
    "MAP_MIN_MAIN_COMPONENT_RATIO",
    "MAP_MAX_GENERATION_ATTEMPTS",
  ];
  return mapConfigKeys.every(
    (key) => JSON.stringify(a[key] ?? null) === JSON.stringify(b[key] ?? null),
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
  const [showAdmin, setShowAdmin] = useState(false);
  const [scenarioQuestionnaire, setScenarioQuestionnaire] = useState<
    number | null
  >(null);
  const [adminQuestionnaire, setAdminQuestionnaire] = useState<number | null>(
    null,
  );
  const [adminScenario, setAdminScenario] = useState<number | null>(null);
  const [questionnaireTitle, setQuestionnaireTitle] = useState("");
  const [scenarioTitle, setScenarioTitle] = useState("");
  const [savingScenario, setSavingScenario] = useState(false);
  const [scenarioConfigDirty, setScenarioConfigDirty] = useState(false);
  const [simulationSnapshot, setSimulationSnapshot] = useState<{
    map: MapData | null;
    path: [number, number][];
    result: LastResult | null;
    step: "config" | "route_canvas" | "results";
    artifacts: string[];
    workflow: "run" | "create";
    mode: "individual" | "queue";
    batch: boolean;
    reviewIndex: number;
    resultIndex: number;
    config: SystemConfig | null;
  } | null>(null);
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
  const [scenarioQueue, setScenarioQueue] = useState<QueueItem[]>([]);
  const [configurationQueue, setConfigurationQueue] = useState<QueueItem[]>([]);
  const queue =
    scenarioQuestionnaire !== null
      ? scenarioQueue
      : workflowMode === "create"
        ? configurationQueue
        : runQueue;
  function setQueue(
    update: QueueItem[] | ((previous: QueueItem[]) => QueueItem[]),
  ) {
    const updateQueue =
      scenarioQuestionnaire !== null
        ? setScenarioQueue
        : workflowMode === "create"
          ? setConfigurationQueue
          : setRunQueue;
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
    if (!mapData && queue.length === 0 && !scenarioConfigDirty) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [mapData, queue.length, scenarioConfigDirty]);

  function startScenario(id: number, title: string) {
    setSimulationSnapshot({
      map: mapData,
      path: userPath,
      result: lastResult,
      step: currentStep,
      artifacts,
      workflow: workflowMode,
      mode: activeTabMode,
      batch: isBatchMode,
      reviewIndex: batchReviewIndex,
      resultIndex: activeBatchResultIndex,
      config,
    });
    setScenarioQuestionnaire(id);
    setQuestionnaireTitle(title);
    setScenarioQueue([]);
    setAdminQuestionnaire(id);
    setAdminScenario(null);
    setScenarioTitle("");
    setScenarioConfigDirty(false);
    setMapData(null);
    setUserPath([]);
    setLastResult(null);
    setArtifacts([]);
    setWorkflowMode("run");
    setActiveTabMode("individual");
    setIsBatchMode(false);
    setCurrentStep("config");
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowAdmin(false);
  }

  function returnToAdmin(scenarioId: number | null = null) {
    if (simulationSnapshot) {
      setMapData(simulationSnapshot.map);
      setUserPath(simulationSnapshot.path);
      setLastResult(simulationSnapshot.result);
      setCurrentStep(simulationSnapshot.step);
      setArtifacts(simulationSnapshot.artifacts);
      setWorkflowMode(simulationSnapshot.workflow);
      setActiveTabMode(simulationSnapshot.mode);
      setIsBatchMode(simulationSnapshot.batch);
      setBatchReviewIndex(simulationSnapshot.reviewIndex);
      setActiveBatchResultIndex(simulationSnapshot.resultIndex);
      setConfig(simulationSnapshot.config);
    }
    setAdminScenario(scenarioId);
    setScenarioQuestionnaire(null);
    setSimulationSnapshot(null);
    setErrorMessage(null);
    setShowAdmin(true);
  }

  async function saveScenario(event: FormEvent) {
    event.preventDefault();
    if (!scenarioQuestionnaire || savingScenario) return;
    const items: QueueItem[] = isBatchMode
      ? queue
      : mapData && lastResult
        ? [
            {
              id: "single",
              config: mapData.config,
              mapData,
              userPath,
              result: lastResult,
              scenarioTitle,
              status: "completed",
            },
          ]
        : [];
    const candidates = items.filter(
      (item) => item.result?.success && !item.scenarioId,
    );
    if (!candidates.length) return;
    if (candidates.some((item) => !item.scenarioTitle?.trim())) {
      setErrorMessage(
        "Enter a name for each successful scenario before saving.",
      );
      return;
    }
    setSavingScenario(true);
    setErrorMessage(null);
    let lastSavedId: number | null = null;
    let failed = false;
    for (const item of candidates) {
      const map = item.mapData;
      const result = item.result;
      if (!map || !result || !item.userPath) {
        failed = true;
        break;
      }
      const configuration: Record<string, unknown> = {
        ...map.config,
        TERRAIN_COLORS: map.terrain_colors,
      };
      delete configuration.OUTPUT_DIR;
      try {
        const response = await fetch(
          `/api/questionnaires/${scenarioQuestionnaire}/scenarios`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: item.scenarioTitle!.trim(),
              configuration,
              data: {
                ...result,
                map: map.grid,
                modified_map: result.modified_grid ?? null,
                start: map.start,
                goal: map.goal,
                optimal_path: result.original_optimal_path,
                alternative_path: item.userPath,
                requested_seed: map.config.MAP_DEFAULT_SEED ?? null,
              },
            }),
          },
        );
        if (!response.ok) {
          const error = await response.json().catch(() => null);
          throw new Error(
            typeof error?.detail === "string"
              ? error.detail
              : "Failed to save scenario.",
          );
        }
        const saved = await response.json();
        lastSavedId = saved.id;
        if (isBatchMode)
          setScenarioQueue((previous) =>
            previous.map((entry) =>
              entry.id === item.id
                ? { ...entry, scenarioId: saved.id, status: "saved" }
                : entry,
            ),
          );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to save scenario.",
        );
        failed = true;
        break;
      }
    }
    setSavingScenario(false);
    if (
      !failed &&
      (!isBatchMode ||
        items.every(
          (item) =>
            item.scenarioId ||
            candidates.some((candidate) => candidate.id === item.id),
        ))
    ) {
      returnToAdmin(lastSavedId);
    } else if (!failed) {
      setSuccessMessage(
        "Successful scenarios saved. Review or retry the remaining items.",
      );
    }
  }

  useEffect(() => {
    if (!isSolvingISP && !isGeneratingMap) return;
    const timer = window.setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isSolvingISP, isGeneratingMap]);

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
      setElapsedTime(0);
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
          workflowMode === "run" && scenarioQuestionnaire === null,
        );
        setLastResult(null);
        setScenarioConfigDirty(false);
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
    [workflowMode, scenarioQuestionnaire],
  );

  const handleImportConfig = useCallback(
    async (
      parsedJson: Record<string, unknown>,
      targetName?: string,
      destinationDir?: string,
    ) => {
      setIsBatchMode(false);
      setElapsedTime(0);
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
          workflowMode === "run" && scenarioQuestionnaire === null,
        );
        setLastResult(null);
        setScenarioConfigDirty(false);
        setMapData(imported);
        setUserPath(imported.user_path);
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
    [workflowMode, scenarioQuestionnaire],
  );

  const handleImportBatchConfigs = useCallback(
    async (items: { name: string; data: Record<string, unknown> }[]) => {
      if (items.length === 0) return;
      setElapsedTime(0);
      setIsGeneratingMap(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      let importedCount = 0;
      const errors: string[] = [];
      const newQueueItems: QueueItem[] = [];
      const shouldPersistArtifacts =
        workflowMode === "run" && scenarioQuestionnaire === null;

      for (const item of items) {
        try {
          const imported = await importConfig(item.data, shouldPersistArtifacts);
          const cleanName = item.name.replace(/\.json$/i, "").trim();
          const queueItem: QueueItem = {
            id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            config: imported.config,
            configurationName:
              workflowMode === "create" ? item.name : undefined,
            scenarioTitle:
              scenarioQuestionnaire !== null
                ? cleanName || `Scenario ${queue.length + newQueueItems.length + 1}`
                : undefined,
            status: "awaiting_route",
            mapData: imported,
            userPath: imported.user_path,
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
          scenarioQuestionnaire !== null
            ? setScenarioQueue
            : workflowMode === "create"
              ? setConfigurationQueue
              : setRunQueue;
        updateQueue((prev) => [...prev, ...newQueueItems]);
        setScenarioConfigDirty(false);
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
    [workflowMode, scenarioQuestionnaire, queue.length],
  );

  const handleSingleSolve = useCallback(async () => {
    if (!mapData) return;
    const routeError = validateDrawingRoute(
      userPath,
      mapData.start,
      mapData.goal,
      mapData.h,
      mapData.w,
      mapData.connectivity,
    );
    if (routeError) {
      setErrorMessage(routeError);
      return;
    }
    setElapsedTime(0);
    setIsSolvingISP(true);
    setErrorMessage(null);

    try {
      const response = await solveISP(
        userPath,
        mapData.config,
        mapData.start,
        mapData.goal,
        mapData.grid,
      );
      if (
        scenarioQuestionnaire !== null &&
        response.result.original_optimal_path
      )
        setMapData({
          ...mapData,
          optimal_path: response.result.original_optimal_path,
        });
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
  }, [mapData, userPath, scenarioQuestionnaire]);

  function handleAddToQueue(
    newConfig: SystemConfig,
    targetName?: string,
    destinationDir?: string,
  ) {
    if (workflowMode === "create" && destinationDir) {
      setConfigurationDestination(destinationDir);
    }
    const id = `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const snapshot = structuredClone(newConfig);
    if (scenarioQuestionnaire !== null) {
      snapshot.OUTPUT_DIR = `${snapshot.OUTPUT_DIR.replace(/[\\/]+$/, "")}/${id}`;
    }
    const newItem: QueueItem = {
      id,
      config: snapshot,
      configurationName: workflowMode === "create" ? targetName : undefined,
      scenarioTitle:
        scenarioQuestionnaire !== null ? `Scenario ${queue.length + 1}` : undefined,
      status: "pending",
    };
    setQueue((prev) => [...prev, newItem]);
    setScenarioConfigDirty(false);
  }

  function handleAddBatch(base: SystemConfig, count: number) {
    const seed = Number.isSafeInteger(base.MAP_DEFAULT_SEED)
      ? base.MAP_DEFAULT_SEED
      : 42;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const items: QueueItem[] = Array.from({ length: count }, (_, index) => ({
      id: `${id}-${index}`,
      config: {
        ...structuredClone(base),
        MAP_DEFAULT_SEED: seed + index,
        OUTPUT_DIR: `${base.OUTPUT_DIR.replace(/[\\/]+$/, "")}/batch-${id}-${index + 1}`,
      },
      status: "pending",
    }));
    setScenarioConfigDirty(false);
    setQueue(items);
    void handleStartBatchReview(items);
  }

  function handleRemoveQueueItem(id: string) {
    const item = queue.find((entry) => entry.id === id);
    if (
      item?.mapData &&
      !item.scenarioId &&
      !window.confirm("Discard this prepared item?")
    )
      return;
    setQueue((prev) => prev.filter((entry) => entry.id !== id));
  }

  function handleClearQueue() {
    if (
      queue.some((item) => item.mapData && !item.scenarioId) &&
      !window.confirm("Discard the prepared items?")
    )
      return;
    setQueue([]);
    setIsBatchMode(false);
    setBatchReviewIndex(0);
  }

  async function handleStartBatchReview(items = queue) {
    const firstIndex = items.findIndex((item) => !item.scenarioId);
    if (firstIndex < 0) return;
    setIsBatchMode(true);
    setBatchReviewIndex(firstIndex);
    setScenarioConfigDirty(false);
    setElapsedTime(0);
    setIsGeneratingMap(true);
    setErrorMessage(null);

    try {
      const firstItem = items[firstIndex];
      let firstMap = firstItem.mapData;
      let initialPath = firstItem.userPath;

      if (!firstMap) {
        firstMap = await generateMap(
          firstItem.config,
          workflowMode === "run" && scenarioQuestionnaire === null,
        );
        initialPath = initialPath || firstMap.auto_path || [firstMap.start];
        setQueue((prev) =>
          prev.map((it, idx) =>
            idx === firstIndex
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

    const targetItem = updatedQueue[targetIndex];
    if (targetItem.scenarioId) return;

    if (targetItem.mapData) {
      setBatchReviewIndex(targetIndex);
      setMapData(targetItem.mapData);
      setUserPath(
        targetItem.userPath ||
          targetItem.mapData.auto_path || [targetItem.mapData.start],
      );
    } else {
      setElapsedTime(0);
      setIsGeneratingMap(true);
      try {
        const newMap = await generateMap(
          targetItem.config,
          workflowMode === "run" && scenarioQuestionnaire === null,
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
        setBatchReviewIndex(targetIndex);
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
    setElapsedTime(0);
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

    setElapsedTime(0);
    setIsGeneratingMap(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const configurations: SaveConfigurationItem[] = finalQueue.map(
        (item) => ({
          name: item.configurationName as string,
          config: item.config,
          start: (item.mapData as MapData).start,
          goal: (item.mapData as MapData).goal,
          user_path: item.userPath as [number, number][],
        }),
      );
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
        err instanceof Error
          ? err.message
          : "Error saving batch configurations",
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
              mapData: mapData
                ? { ...mapData, config: item.config }
                : item.mapData,
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
    const nextIndex = queue.findIndex(
      (item, index) => index > batchReviewIndex && !item.scenarioId,
    );
    if (nextIndex >= 0) await handleSwitchBatchMap(nextIndex);
    else void handleExecuteBatch();
  }

  function handlePrevBatchMap() {
    const previousIndex = queue
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => index < batchReviewIndex && !item.scenarioId)
      .at(-1)?.index;
    if (previousIndex !== undefined) void handleSwitchBatchMap(previousIndex);
  }

  function handleReuseRouteFrom(sourceIdx: number) {
    const sourceItem = queue[sourceIdx];
    const sourcePath = sourceItem?.userPath;
    if (sourcePath && sourcePath.length > 0) {
      const copy = [...sourcePath];
      if (!arePathsEqual(copy, userPath)) setLastResult(null);
      setUserPath(copy);
      setQueue((prev) =>
        prev.map((it, idx) =>
          idx === batchReviewIndex &&
          !it.scenarioId &&
          !arePathsEqual(it.userPath, copy)
            ? {
                ...it,
                userPath: copy,
                result: undefined,
                artifacts: undefined,
                error: undefined,
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
        (targetIndices.includes(idx) || idx === batchReviewIndex) &&
        !it.scenarioId &&
        !arePathsEqual(it.userPath, currentPathCopy)
          ? {
              ...it,
              userPath: currentPathCopy,
              result: undefined,
              artifacts: undefined,
              error: undefined,
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
    const invalid = finalQueue.findIndex(
      (item) =>
        !item.mapData ||
        !item.userPath ||
        validateDrawingRoute(
          item.userPath,
          item.mapData.start,
          item.mapData.goal,
          item.mapData.h,
          item.mapData.w,
          item.mapData.connectivity,
        ),
    );
    if (invalid >= 0) {
      setErrorMessage(
        `Review the route for map ${invalid + 1} before solving the batch.`,
      );
      return;
    }
    setQueue(finalQueue);

    setElapsedTime(0);
    setIsSolvingISP(true);
    setErrorMessage(null);
    setCurrentStep("results");
    setActiveBatchResultIndex(0);

    for (let i = 0; i < finalQueue.length; i++) {
      const item = finalQueue[i];
      if (item.scenarioId || item.result?.success) continue;
      setActiveBatchResultIndex(i);

      setQueue((prev) =>
        prev.map((it, idx) =>
          idx === i
            ? { ...it, status: "solving", error: undefined, result: undefined }
            : it,
        ),
      );

      try {
        const effectivePath = item.userPath || item.mapData?.auto_path || [];
        if (!item.mapData) {
          throw new Error("Batch item has no generated map.");
        }
        const response = await solveISP(
          effectivePath,
          item.mapData.config,
          item.mapData.start,
          item.mapData.goal,
          item.mapData.grid,
        );

        setQueue((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: response.result.success ? "completed" : "failed",
                  error: response.result.success
                    ? undefined
                    : response.result.explanation_text,
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

  if (showAdmin) {
    return (
      <>
        <QuestionnaireAdmin
          initialQuestionnaireId={adminQuestionnaire}
          initialScenarioId={adminScenario}
          onCreateScenario={startScenario}
          onBack={() => {
            setAdminQuestionnaire(null);
            setAdminScenario(null);
            setShowAdmin(false);
          }}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
        <AboutModal
          isOpen={isAboutOpen}
          onClose={() => setIsAboutOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="app-layout">
      <Topbar
        currentStep={currentStep}
        onSelectStep={(step) => {
          if (isSolvingISP || isGeneratingMap || savingScenario) return;
          if (currentStep === "route_canvas" && isBatchMode) {
            setQueue((previous) =>
              previous.map((item, index) =>
                index === batchReviewIndex && !item.scenarioId
                  ? { ...item, userPath }
                  : item,
              ),
            );
          }
          if (
            step === "route_canvas" &&
            isBatchMode &&
            queue[batchReviewIndex]?.scenarioId
          ) {
            const index = queue.findIndex(
              (item) => !item.scenarioId && item.mapData,
            );
            if (index < 0) return;
            const item = queue[index];
            setBatchReviewIndex(index);
            setMapData(item.mapData!);
            setUserPath(item.userPath ?? item.mapData!.auto_path);
          }
          if (
            scenarioQuestionnaire !== null &&
            currentStep === "config" &&
            step !== "config" &&
            scenarioConfigDirty
          ) {
            if (!window.confirm("Discard changes to the configuration?"))
              return;
            setScenarioConfigDirty(false);
          }
          setCurrentStep(step);
        }}
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
        onOpenAdmin={() => {
          if (isSolvingISP || isGeneratingMap || savingScenario) return;
          if (scenarioQuestionnaire !== null) {
            if (
              !window.confirm(
                "Discard the unfinished scenario and return to questionnaires?",
              )
            )
              return;
            returnToAdmin();
          } else setShowAdmin(true);
        }}
      />

      <main className="main-content-wrapper">
        <div className="queue-banner" role="status">
          <span className="alert-text">
            Destination:{" "}
            {scenarioQuestionnaire !== null
              ? `Questionnaire: ${questionnaireTitle}`
              : "Benchmark"}
          </span>
        </div>
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
              scenarioMode={scenarioQuestionnaire !== null}
              onConfigChange={
                scenarioQuestionnaire !== null
                  ? () => setScenarioConfigDirty(true)
                  : undefined
              }
              onBeforeGenerate={() =>
                (!mapData && queue.length === 0) ||
                window.confirm(
                  "Discard the current simulation and generate new maps?",
                )
              }
              key={config ? "server-config" : "fallback-config"}
              initialConfig={config}
              onDraftChange={setConfig}
              onGenerateMap={handleGenerateMap}
              onAddToQueue={handleAddToQueue}
              onAddBatch={handleAddBatch}
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
                  scenarioMode={scenarioQuestionnaire !== null}
                  workflowMode={workflowMode}
                  currentIndex={batchReviewIndex}
                  isProcessing={isSolvingISP || isGeneratingMap}
                  interactiveMode={interactiveQueueMode}
                  onToggleInteractiveMode={setInteractiveQueueMode}
                  onRemoveItem={handleRemoveQueueItem}
                  onClearQueue={handleClearQueue}
                  onStartQueue={() => void handleStartBatchReview()}
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
              onPathChange={(path) => {
                if (!arePathsEqual(path, userPath)) setLastResult(null);
                if (isBatchMode && !arePathsEqual(path, userPath))
                  setQueue((previous) =>
                    previous.map((item, index) =>
                      index === batchReviewIndex && !item.scenarioId
                        ? {
                            ...item,
                            userPath: path,
                            result: undefined,
                            error: undefined,
                            status: "awaiting_route",
                          }
                        : item,
                    ),
                  );
                setUserPath(path);
              }}
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
                if (isBatchMode)
                  setQueue((previous) =>
                    previous.map((item, index) =>
                      index === batchReviewIndex ? { ...item, userPath } : item,
                    ),
                  );
                if (
                  scenarioQuestionnaire !== null &&
                  !window.confirm(
                    "Return to configuration? Your prepared maps and routes will be kept.",
                  )
                )
                  return;
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
                      ? "Save Route & Next Map →"
                      : `Solve Batch (${queue.length} Runs)`
                    : "Solve ISP"
              }
              onPrevMap={
                isBatchMode && batchReviewIndex > 0
                  ? handlePrevBatchMap
                  : undefined
              }
              batchStepper={
                isBatchMode && queue.length > 1
                  ? (() => {
                      const currentBatchItem = queue[batchReviewIndex];
                      const matchingBatchIndices = currentBatchItem
                        ? queue
                            .map((item, idx) => ({ item, idx }))
                            .filter(
                              ({ idx, item }) =>
                                idx !== batchReviewIndex &&
                                !item.scenarioId &&
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
                        arePathsEqual(
                          userPath,
                          matchingRunWithRoute.item.userPath,
                        ),
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
                                      item.userPath[
                                        item.userPath.length - 1
                                      ][0] === itemGoal[0] &&
                                      item.userPath[
                                        item.userPath.length - 1
                                      ][1] === itemGoal[1],
                                    );

                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  className={`batch-step-btn ${
                                    isActive ? "active" : ""
                                  }`}
                                  onClick={() => handleSwitchBatchMap(idx)}
                                  disabled={
                                    isGeneratingMap ||
                                    isSolvingISP ||
                                    Boolean(item.scenarioId)
                                  }
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
                                      : matchingRunWithRoute &&
                                          !isSyncedWithSource
                                        ? `Map #${matchingRunWithRoute.idx + 1} has a verified route (${matchingRunWithRoute.item.userPath?.length} steps). You can copy it with 1 click, or keep a custom route.`
                                        : `Maps ${[
                                            batchReviewIndex + 1,
                                            ...matchingBatchIndices.map(
                                              (m) => m.idx + 1,
                                            ),
                                          ]
                                            .sort()
                                            .map((n) => `#${n}`)
                                            .join(
                                              ", ",
                                            )} share this exact terrain & obstacles. You can draw once and apply to all.`}
                                  </span>
                                </div>

                                {batchRouteFeedback && (
                                  <div className="identical-maps-toast">
                                    {batchRouteFeedback}
                                  </div>
                                )}
                              </div>

                              <div className="identical-maps-actions">
                                {matchingRunWithRoute &&
                                  !isSyncedWithSource && (
                                    <button
                                      type="button"
                                      className="btn btn-vibrant btn-sm"
                                      onClick={() =>
                                        handleReuseRouteFrom(
                                          matchingRunWithRoute.idx,
                                        )
                                      }
                                      title={`Copy route from Map #${matchingRunWithRoute.idx + 1}`}
                                    >
                                      Copy Route from Map #
                                      {matchingRunWithRoute.idx + 1}
                                    </button>
                                  )}

                                <button
                                  type="button"
                                  className={`btn ${
                                    areAllMatchingSynced
                                      ? "btn-ghost"
                                      : matchingRunWithRoute &&
                                          !isSyncedWithSource
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
                    })()
                  : undefined
              }
            />
          </div>
        )}

        {currentStep === "results" && (
          <div key="step-results" className="step-container results-step">
            {isBatchMode && !isSolvingISP && queue[activeBatchResultIndex] && (
              <div className="qa-panel qa-form scenario-save-form">
                {queue[activeBatchResultIndex].error && (
                  <p role="alert">{queue[activeBatchResultIndex].error}</p>
                )}
                {scenarioQuestionnaire !== null && (
                  <div className="form-group">
                    <label htmlFor="batch-scenario-name">Scenario name</label>
                    <input
                      id="batch-scenario-name"
                      value={queue[activeBatchResultIndex].scenarioTitle ?? ""}
                      disabled={
                        Boolean(queue[activeBatchResultIndex].scenarioId) ||
                        savingScenario
                      }
                      onChange={(event) => {
                        const title = event.target.value;
                        setScenarioQueue((previous) =>
                          previous.map((item, index) =>
                            index === activeBatchResultIndex
                              ? { ...item, scenarioTitle: title }
                              : item,
                          ),
                        );
                      }}
                    />
                  </div>
                )}
                {queue[activeBatchResultIndex].scenarioId && (
                  <p role="status">Saved to questionnaire</p>
                )}
                {queue[activeBatchResultIndex].status === "failed" && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const item = queue[activeBatchResultIndex];
                      if (!item.mapData) return;
                      setBatchReviewIndex(activeBatchResultIndex);
                      setMapData(item.mapData);
                      setUserPath(item.userPath ?? item.mapData.auto_path);
                      setCurrentStep("route_canvas");
                    }}
                  >
                    Review route and retry
                  </button>
                )}
                {scenarioQuestionnaire !== null && (
                  <form onSubmit={saveScenario}>
                    <button
                      type="submit"
                      className="btn btn-vibrant"
                      disabled={
                        savingScenario ||
                        !queue.some(
                          (item) => item.result?.success && !item.scenarioId,
                        )
                      }
                    >
                      {savingScenario
                        ? "Saving scenarios..."
                        : "Save successful scenarios"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {scenarioQuestionnaire !== null &&
              !isBatchMode &&
              lastResult?.success && (
                <form
                  className="qa-panel qa-form scenario-save-form"
                  onSubmit={saveScenario}
                >
                  <div className="form-group">
                    <label htmlFor="scenario-name">Scenario name</label>
                    <input
                      id="scenario-name"
                      required
                      value={scenarioTitle}
                      onChange={(event) => setScenarioTitle(event.target.value)}
                      disabled={savingScenario}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-vibrant"
                    disabled={savingScenario || !scenarioTitle.trim()}
                  >
                    {savingScenario
                      ? "Saving scenario..."
                      : "Save scenario to questionnaire"}
                  </button>
                </form>
              )}

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
              onNewRun={
                scenarioQuestionnaire !== null
                  ? undefined
                  : () => {
                      if (isSolvingISP || savingScenario) return;
                      if (
                        isBatchMode &&
                        !window.confirm(
                          "Discard the current simulation and start again?",
                        )
                      )
                        return;
                      setIsBatchMode(false);
                      setCurrentStep("config");
                    }
              }
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

            {scenarioQuestionnaire === null &&
              queue.length > 0 &&
              !isBatchMode && (
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
                    onStartQueue={() => void handleStartBatchReview()}
                    onSelectItem={handleSelectQueueItem}
                  />
                </div>
              )}
          </div>
        )}
      </main>

      {((isGeneratingMap && currentStep === "config") ||
        (isSolvingISP && !isBatchMode)) && (
        <div className="loading-overlay-backdrop">
          <div
            className="loading-overlay-card"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="loading-spinner" aria-hidden="true" />
            <h3>
              {isGeneratingMap ? "Generating Map..." : "Solving ISP Model..."}
            </h3>
            {(() => {
              if (isGeneratingMap) return null;
              const activeConfig =
                isBatchMode && queue[activeBatchResultIndex]
                  ? queue[activeBatchResultIndex].config
                  : mapData?.config || config;
              if (!activeConfig) return null;
              const reduction = formatReductionMethod(
                activeConfig.DEFAULT_REDUCTION_METHOD,
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
              {isGeneratingMap
                ? "Preparing terrain, elevation and routes. Larger maps may take longer."
                : "Solving ISP formulation via Mixed-Integer Linear Programming (MILP). Because the inverse problem under discrete terrain attributes is NP-hard, solving large grids or runs without graph reduction explores a large combinatorial space and may take several minutes depending on hardware. Please wait..."}
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
