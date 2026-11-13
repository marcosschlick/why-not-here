import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AboutModal } from "./components/AboutModal";
import { ConfigForm } from "./components/ConfigForm";
import { ConfirmModal } from "./components/ConfirmModal";
import type { ConfirmModalProps } from "./components/ConfirmModal";
import { QueuePanel } from "./components/QueuePanel";
import { ResultsView } from "./components/ResultsView";
import { RouteCanvas } from "./components/RouteCanvas";
import { validateDrawingRoute } from "./utils/validateRoute";
import {
  createExperimentItems,
  reviewIndices,
  sameReviewGroup,
} from "./utils/experiments";
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
  NamingMetadata,
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
  const [scenarioTitle, setScenarioTitle] = useState("");
  const [questionnaireTitle, setQuestionnaireTitle] = useState("");
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
  const [benchmark, setBenchmark] = useState(false);
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
  const reviewSteps = reviewIndices(queue);
  const reviewPosition = reviewSteps.indexOf(batchReviewIndex);
  const [interactiveQueueMode, setInteractiveQueueMode] =
    useState<boolean>(true);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [confirmation, setConfirmation] = useState<Pick<
    ConfirmModalProps,
    "title" | "description" | "confirmLabel" | "cancelLabel" | "onConfirm"
  > | null>(null);

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
    setQuestionnaireTitle("");
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

  function prepareItems(
    parameters: SystemConfig,
    naming: NamingMetadata,
    useBenchmark: boolean,
    map?: MapData,
    path?: [number, number][],
  ): QueueItem[] {
    const items = createExperimentItems(
      parameters,
      naming,
      useBenchmark && scenarioQuestionnaire === null,
      map,
      path,
    );
    return items.map((item) => ({
      ...item,
      scenarioTitle:
        scenarioQuestionnaire !== null
          ? `Scenario ${queue.length + 1}`
          : undefined,
    }));
  }

  async function handleGenerateMap(
    targetConfig: SystemConfig,
    useBenchmark: boolean,
  ) {
    if (useBenchmark && scenarioQuestionnaire === null) {
      const items = prepareItems(targetConfig, {}, true);
      setQueue(items);
      setActiveTabMode("queue");
      await handleStartBatchReview(items);
      return;
    }
    setIsBatchMode(false);
    setElapsedTime(0);
    setIsGeneratingMap(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const generated = await generateMap(targetConfig);
      setLastResult(null);
      setScenarioConfigDirty(false);
      setMapData(generated);
      setUserPath(generated.auto_path || [generated.start]);
      setCurrentStep("route_canvas");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Error generating map",
      );
    } finally {
      setIsGeneratingMap(false);
    }
  }

  async function handleImportConfig(
    parsedJson: Record<string, unknown>,
    useBenchmark: boolean,
  ) {
    setElapsedTime(0);
    setIsGeneratingMap(true);
    setErrorMessage(null);
    try {
      const imported = await importConfig(parsedJson);
      if (useBenchmark && scenarioQuestionnaire === null) {
        const items = prepareItems(
          imported.config,
          {},
          true,
          imported,
          imported.user_path,
        );
        setQueue(items);
        setActiveTabMode("queue");
        await handleStartBatchReview(items);
      } else {
        setIsBatchMode(false);
        setLastResult(null);
        setScenarioConfigDirty(false);
        setMapData(imported);
        setUserPath(imported.user_path);
        setConfig(imported.config);
        setCurrentStep("route_canvas");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error importing configuration",
      );
    } finally {
      setIsGeneratingMap(false);
    }
  }

  async function handleImportBatchConfigs(
    files: { name: string; data: Record<string, unknown> }[],
    useBenchmark: boolean,
  ) {
    setElapsedTime(0);
    setIsGeneratingMap(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const errors: string[] = [];
    const items: QueueItem[] = [];
    for (const [index, file] of files.entries()) {
      try {
        const imported = await importConfig(file.data);
        items.push(
          ...prepareItems(
            imported.config,
            files.length > 1 ? { map_index: index + 1 } : {},
            useBenchmark,
            imported,
            imported.user_path,
          ).map((item) => ({
            ...item,
            scenarioTitle:
              scenarioQuestionnaire !== null
                ? file.name.replace(/\.json$/i, "")
                : undefined,
          })),
        );
      } catch (error) {
        errors.push(
          `${file.name}: ${error instanceof Error ? error.message : "Import failed"}`,
        );
      }
    }
    setQueue((previous) => [...previous, ...items]);
    setScenarioConfigDirty(false);
    if (items.length)
      setSuccessMessage(`Imported ${items.length} items to the queue.`);
    if (errors.length) setErrorMessage(errors.join("; "));
    setIsGeneratingMap(false);
  }

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
      setMapData({
        ...mapData,
        map_image_url:
          response.artifacts.find((url) => url.startsWith("/output/map/")) ||
          "",
        optimal_path:
          response.result.original_optimal_path || mapData.optimal_path,
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
  }, [mapData, userPath]);

  function handleAddToQueue(newConfig: SystemConfig, useBenchmark: boolean) {
    const items = prepareItems(newConfig, {}, useBenchmark);
    setQueue((previous) => [...previous, ...items]);
    setScenarioConfigDirty(false);
  }

  function handleRemoveQueueItem(id: string) {
    const item = queue.find((entry) => entry.id === id);
    const removeItem = () =>
      setQueue((prev) =>
        prev.filter((entry) => !item || !sameReviewGroup(entry, item)),
      );
    if (item?.mapData && !item.scenarioId) {
      setConfirmation({
        title: "Discard Prepared Item",
        description: item.benchmarkGroup
          ? "Discard this Benchmark group and its ten combinations?"
          : "Discard this prepared item?",
        confirmLabel: "Discard Item",
        onConfirm: removeItem,
      });
      return;
    }
    removeItem();
  }

  function handleClearQueue() {
    const clearQueue = () => {
      setQueue([]);
      setIsBatchMode(false);
      setBatchReviewIndex(0);
    };
    if (queue.some((item) => item.mapData && !item.scenarioId)) {
      setConfirmation({
        title: "Discard Prepared Items",
        description: "Discard the prepared items?",
        confirmLabel: "Discard Items",
        onConfirm: clearQueue,
      });
      return;
    }
    clearQueue();
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
        firstMap = await generateMap(firstItem.config, false);
        initialPath = initialPath || firstMap.auto_path || [firstMap.start];
        setQueue((prev) =>
          prev.map((it) =>
            sameReviewGroup(it, firstItem)
              ? {
                  ...it,
                  config: { ...firstMap!.config, ...it.config },
                  mapData: {
                    ...firstMap!,
                    config: { ...firstMap!.config, ...it.config },
                  },
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

    const updatedQueue = queue.map((it) =>
      sameReviewGroup(it, queue[batchReviewIndex]) ? { ...it, userPath } : it,
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
        const newMap = await generateMap(targetItem.config, false);
        const initialPath = targetItem.userPath ||
          newMap.auto_path || [newMap.start];

        setQueue((prev) =>
          prev.map((it) =>
            sameReviewGroup(it, targetItem)
              ? {
                  ...it,
                  config: { ...newMap.config, ...it.config },
                  mapData: {
                    ...newMap,
                    config: { ...newMap.config, ...it.config },
                  },
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
    if (!mapData) return;
    setElapsedTime(0);
    setIsGeneratingMap(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await saveConfigurations({
        configurations: [
          {
            config: mapData.config,
            start: mapData.start,
            goal: mapData.goal,
            user_path: userPath,
          },
        ],
      });
      setSuccessMessage(`Configuration saved to ${result.saved_files[0]}`);
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
    if (finalQueue.some((item) => !item.mapData || !item.userPath?.length)) {
      setErrorMessage("Every batch item must have a map and route.");
      return;
    }

    setElapsedTime(0);
    setIsGeneratingMap(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const configurations: SaveConfigurationItem[] = finalQueue.map(
        (item) => ({
          naming: item.naming,
          config: item.config,
          start: (item.mapData as MapData).start,
          goal: (item.mapData as MapData).goal,
          user_path: item.userPath as [number, number][],
        }),
      );
      const result = await saveConfigurations({
        configurations,
      });
      setQueue((previous) =>
        previous.map((item, index) => ({
          ...item,
          savedFile: result.saved_files[index],
          status: "saved",
        })),
      );
      setSuccessMessage(
        `Saved ${result.saved_files.length} configurations to configurations/`,
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
      const finalQueue = queue.map((item) =>
        sameReviewGroup(item, queue[batchReviewIndex])
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
      const nextIndex = reviewIndices(queue).find(
        (index) => index > batchReviewIndex,
      );
      if (nextIndex !== undefined) {
        await handleSwitchBatchMap(nextIndex);
      } else {
        await handleSaveBatchConfigurations(finalQueue);
      }
      return;
    }
    const nextIndex = reviewIndices(queue).find(
      (index) => index > batchReviewIndex,
    );
    if (nextIndex !== undefined) await handleSwitchBatchMap(nextIndex);
    else void handleExecuteBatch();
  }

  function handlePrevBatchMap() {
    const previousIndex = reviewIndices(queue)
      .filter((index) => index < batchReviewIndex)
      .at(-1);
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
        prev.map((it) =>
          sameReviewGroup(it, queue[batchReviewIndex]) &&
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
      prev.map((it) =>
        (targetIndices.some((index) => sameReviewGroup(it, queue[index])) ||
          sameReviewGroup(it, queue[batchReviewIndex])) &&
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
    const finalQueue = queue.map((it) =>
      sameReviewGroup(it, queue[batchReviewIndex]) ? { ...it, userPath } : it,
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
          item.config,
          item.mapData.start,
          item.mapData.goal,
          item.mapData.grid,
          item.naming,
        );

        setQueue((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  outputDir: response.output_dir,
                  mapData: it.mapData
                    ? {
                        ...it.mapData,
                        map_image_url:
                          response.artifacts.find((url) =>
                            url.startsWith("/output/map/"),
                          ) || "",
                      }
                    : undefined,
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

  const hasMapData = Boolean(mapData);
  const hasResults = Boolean(lastResult || (isBatchMode && queue.length > 0));

  function handleSelectStep(step: "config" | "route_canvas" | "results") {
    if (isSolvingISP || isGeneratingMap || savingScenario) return;
    if (currentStep === "route_canvas" && isBatchMode) {
      setQueue((previous) =>
        previous.map((item) =>
          sameReviewGroup(item, queue[batchReviewIndex]) && !item.scenarioId
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
      const index = queue.findIndex((item) => !item.scenarioId && item.mapData);
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
      setConfirmation({
        title: "Discard Configuration Changes",
        description: "Discard changes to the configuration?",
        confirmLabel: "Discard Changes",
        onConfirm: () => {
          setScenarioConfigDirty(false);
          setCurrentStep(step);
        },
      });
      return;
    }
    setCurrentStep(step);
  }

  function openQuestionnaires() {
    if (isSolvingISP || isGeneratingMap || savingScenario) return;
    if (scenarioQuestionnaire === null) {
      setShowAdmin(true);
      return;
    }
    const hasUnsavedWork =
      scenarioConfigDirty ||
      scenarioQueue.some((item) => !item.scenarioId) ||
      (!isBatchMode && Boolean(mapData));
    if (!hasUnsavedWork) {
      returnToAdmin();
      return;
    }
    setConfirmation({
      title: "Discard Unfinished Scenario",
      description:
        "Unsaved configuration, maps, routes and results will be discarded. Saved scenarios will remain in the questionnaire.",
      cancelLabel: "Keep editing",
      confirmLabel: "Discard and return",
      onConfirm: () => returnToAdmin(),
    });
  }

  if (showAdmin) {
    return (
      <>
        <QuestionnaireAdmin
          currentStep={currentStep}
          hasMapData={hasMapData}
          hasResults={hasResults}
          initialQuestionnaireId={adminQuestionnaire}
          initialScenarioId={adminScenario}
          onCreateScenario={startScenario}
          onSelectStep={(step) => {
            setAdminQuestionnaire(null);
            setAdminScenario(null);
            setShowAdmin(false);
            handleSelectStep(step);
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
        activeView="simulation"
        currentStep={currentStep}
        onSelectStep={handleSelectStep}
        hasMapData={hasMapData}
        hasResults={hasResults}
        onOpenAbout={() => setIsAboutOpen(true)}
        scenarioMode={scenarioQuestionnaire !== null}
        onOpenAdmin={openQuestionnaires}
      />

      <main className="main-content-wrapper">
        <div className="workflow-context">
          <div>
            <strong>
              {scenarioQuestionnaire !== null
                ? "Creating scenario"
                : "Simulation"}
            </strong>
            {scenarioQuestionnaire !== null && (
              <span>Questionnaire: {questionnaireTitle}</span>
            )}
            {scenarioQuestionnaire !== null && (
              <span>
                {currentStep === "config"
                  ? activeTabMode === "queue"
                    ? "Next: add or import configurations, then review their routes."
                    : "Next: generate or import a map, then define a route."
                  : currentStep === "route_canvas"
                    ? "Next: solve the route, then review and save the scenario."
                    : "Review the results and save the scenario to the questionnaire."}
              </span>
            )}
          </div>
          {scenarioQuestionnaire !== null && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={openQuestionnaires}
              disabled={isGeneratingMap || isSolvingISP || savingScenario}
            >
              Back to questionnaire
            </button>
          )}
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
              benchmark={scenarioQuestionnaire === null && benchmark}
              onBenchmarkChange={setBenchmark}
              onConfigChange={
                scenarioQuestionnaire !== null
                  ? () => setScenarioConfigDirty(true)
                  : undefined
              }
              onBeforeGenerate={(action) => {
                if (!mapData && queue.length === 0) {
                  action();
                  return;
                }
                setConfirmation({
                  title: "Generate New Maps",
                  description:
                    "Discard the current simulation and generate new maps?",
                  confirmLabel: "Generate New Maps",
                  onConfirm: action,
                });
              }}
              key={config ? "server-config" : "fallback-config"}
              initialConfig={config}
              onDraftChange={setConfig}
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
                    previous.map((item) =>
                      sameReviewGroup(item, queue[batchReviewIndex]) &&
                      !item.scenarioId
                        ? {
                            ...item,
                            userPath: path,
                            result: undefined,
                            artifacts: undefined,
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
                    previous.map((item) =>
                      sameReviewGroup(item, queue[batchReviewIndex])
                        ? { ...item, userPath }
                        : item,
                    ),
                  );
                const returnToConfig = () => {
                  setIsBatchMode(false);
                  setCurrentStep("config");
                };
                if (scenarioQuestionnaire !== null) {
                  setConfirmation({
                    title: "Return to Configuration",
                    description:
                      "Return to configuration? Your prepared maps and routes will be kept.",
                    confirmLabel: "Return to Configuration",
                    onConfirm: returnToConfig,
                  });
                  return;
                }
                returnToConfig();
              }}
              busyButtonText={
                workflowMode === "create"
                  ? "Saving Configuration..."
                  : "Solving ISP..."
              }
              solveButtonText={
                workflowMode === "create"
                  ? isBatchMode
                    ? reviewIndices(queue).some(
                        (index) => index > batchReviewIndex,
                      )
                      ? `Save Route & Next Map (${reviewPosition + 2}/${reviewSteps.length})`
                      : "Save Batch Configurations"
                    : "Save Configuration"
                  : isBatchMode
                    ? reviewIndices(queue).some(
                        (index) => index > batchReviewIndex,
                      )
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
                      const matchingBatchIndices =
                        currentBatchItem && !currentBatchItem.benchmarkGroup
                          ? queue
                              .map((item, idx) => ({ item, idx }))
                              .filter(
                                ({ idx, item }) =>
                                  idx !== batchReviewIndex &&
                                  !item.scenarioId &&
                                  !item.benchmarkGroup &&
                                  isSameMap(
                                    item.config,
                                    currentBatchItem.config,
                                  ),
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
                                ? `Configuration Route Setup, Map ${reviewPosition + 1} of ${reviewSteps.length}`
                                : `Batch Route Setup - Map ${reviewPosition + 1} of ${reviewSteps.length}`}
                            </span>
                            <span className="batch-stepper-sub">
                              {workflowMode === "create"
                                ? "Define one route per map; Benchmark combinations share that route."
                                : "Define custom routes for all maps in the batch before solving."}
                            </span>
                          </div>

                          <div className="batch-steps-list">
                            {reviewIndices(queue).map((idx) => {
                              const item = queue[idx];
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
                                      ? `Item ${idx + 1} (${item.config.MAP_H}x${item.config.MAP_W})`
                                      : `Map ${reviewSteps.indexOf(idx) + 1} (${item.config.MAP_H}x${item.config.MAP_W})${item.benchmarkGroup ? " · 10 combinations" : ""}`}
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
            {scenarioQuestionnaire !== null &&
              isBatchMode &&
              !isSolvingISP &&
              queue[activeBatchResultIndex] && (
                <div className="qa-panel qa-form scenario-save-form">
                  {queue[activeBatchResultIndex].error && (
                    <p role="alert">{queue[activeBatchResultIndex].error}</p>
                  )}
                  {scenarioQuestionnaire !== null && (
                    <div className="form-group">
                      <label htmlFor="batch-scenario-name">Scenario name</label>
                      <input
                        id="batch-scenario-name"
                        value={
                          queue[activeBatchResultIndex].scenarioTitle ?? ""
                        }
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
                      const startAgain = () => {
                        setIsBatchMode(false);
                        setCurrentStep("config");
                      };
                      if (isBatchMode) {
                        setConfirmation({
                          title: "Start Again",
                          description:
                            "Discard the current simulation and start again?",
                          confirmLabel: "Start Again",
                          onConfirm: startAgain,
                        });
                        return;
                      }
                      startAgain();
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
                    Grid Dimension: {h}×{w} (Seed: {seed})
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

      {confirmation && (
        <ConfirmModal
          key={confirmation.title}
          {...confirmation}
          busy={false}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            setConfirmation(null);
            confirmation.onConfirm();
          }}
        />
      )}
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </div>
  );
}

export default App;
