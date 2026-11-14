import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AboutModal } from "./components/AboutModal";
import { ConfigForm } from "./components/ConfigForm";
import { ConfirmModal } from "./components/ConfirmModal";
import type { ConfirmModalProps } from "./components/ConfirmModal";
import { QueuePanel } from "./components/QueuePanel";
import { ResultsView } from "./components/ResultsView";
import { RouteCanvas } from "./components/RouteCanvas";
import { executionStatus, requestFailure } from "./utils/execution";
import { validateDrawingRoute } from "./utils/validateRoute";
import {
  createExperimentItems,
  groupQueue,
  reviewIndices,
  sameReviewGroup,
} from "./utils/experiments";
import { directoryName, formatReductionMethod } from "./utils/formatters";
import { Topbar } from "./components/Topbar";
import { QuestionnaireAdmin } from "./components/QuestionnaireAdmin";
import {
  createBatch,
  fetchConfig,
  generateMap,
  importConfig,
  saveConfigurations,
  solveISP,
} from "./services/api";
import type {
  ExecutionMetadata,
  LastResult,
  MapData,
  QueueItem,
  SaveConfigurationItem,
  SystemConfig,
} from "./types";
import { FrontendError, presentError, useI18n } from "./i18n";
import { LanguageProvider } from "./LanguageProvider";
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
  const { language, t, n } = useI18n();
  const [showAdmin, setShowAdmin] = useState(false);
  useLayoutEffect(() => {
    document.documentElement.lang = showAdmin ? "en" : language;
  }, [language, showAdmin]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const initialConfigRef = useRef<SystemConfig | null>(null);
  const [activeTabMode, setActiveTabMode] = useState<"individual" | "queue">(
    "individual",
  );
  const [workflowMode, setWorkflowMode] = useState<"run" | "create">("run");
  const [benchmark, setBenchmark] = useState(false);
  const [executionRecords, setExecutionRecords] = useState<
    { group: string; result: LastResult }[]
  >([]);
  const [exportGroup, setExportGroup] = useState("");
  const [batchDirectory, setBatchDirectory] = useState<{
    name: string;
    output_dir: string;
  } | null>(null);
  const [singleOutputDirectory, setSingleOutputDirectory] = useState<
    string | null
  >(null);
  const [resultsNoticeDismissed, setResultsNoticeDismissed] = useState(false);
  const executionOrder = useRef(0);
  const attempts = useRef(new Map<string, number>());
  function nextExecution(key: string, group?: string): ExecutionMetadata {
    const attempt = (attempts.current.get(key) ?? 0) + 1;
    attempts.current.set(key, attempt);
    return {
      run_id: crypto.randomUUID(),
      benchmark_group_id: group,
      attempt_index: attempt,
      execution_order: ++executionOrder.current,
    };
  }
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
    const updateQueue =
      workflowMode === "create" ? setConfigurationQueue : setRunQueue;
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
    if (!mapData && queue.length === 0) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [mapData, queue.length]);
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
        initialConfigRef.current = initialConfig;
        setConfig(initialConfig);
      } catch (err) {
        setErrorMessage(
          presentError(language, err, "Failed to load server configuration"),
        );
      }
    }
    loadInitial();
  }, [language]);
  async function handleGenerateMap(
    targetConfig: SystemConfig,
    useBenchmark: boolean,
  ) {
    setElapsedTime(0);
    setIsGeneratingMap(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const items = await createExperimentItems(
        targetConfig,
        {},
        useBenchmark,
        undefined,
        undefined,
        workflowMode,
      );
      if (items.length > 1) {
        setQueue(items);
        if (useBenchmark) setActiveTabMode("queue");
        await handleStartBatchReview(items);
        return;
      }
      const generated = await generateMap(items[0].config);
      setIsBatchMode(false);
      setLastResult(null);
      setMapData(generated);
      setUserPath(generated.auto_path || [generated.start]);
      setCurrentStep("route_canvas");
    } catch (error) {
      setErrorMessage(
        presentError(language, error, "Error preparing map scenarios"),
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
      const items = await createExperimentItems(
        imported.config,
        {
          benchmark_group_id: imported.execution?.benchmark_group_id,
        },
        useBenchmark,
        imported,
        imported.user_path,
        workflowMode,
        imported.execution?.benchmark_member,
      );
      if (items.length > 1) {
        setQueue(items);
        if (useBenchmark) setActiveTabMode("queue");
        await handleStartBatchReview(items);
      } else {
        const preparedMap = { ...imported, config: items[0].config };
        setIsBatchMode(false);
        setLastResult(null);
        setMapData(preparedMap);
        setUserPath(imported.user_path);
        setConfig(items[0].config);
        setCurrentStep("route_canvas");
      }
    } catch (error) {
      setErrorMessage(
        presentError(language, error, "Error importing configuration"),
      );
    } finally {
      setIsGeneratingMap(false);
    }
  }
  async function handleImportBatchConfigs(
    files: {
      name: string;
      data: Record<string, unknown>;
    }[],
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
          ...(await createExperimentItems(
            imported.config,
            {
              ...(files.length > 1 ? { map_index: index + 1 } : {}),
              benchmark_group_id: imported.execution?.benchmark_group_id,
            },
            useBenchmark,
            imported,
            imported.user_path,
            workflowMode,
            imported.execution?.benchmark_member,
          )),
        );
      } catch (error) {
        errors.push(
          `${file.name}: ${presentError(language, error, "Import failed")}`,
        );
      }
    }
    setQueue((previous) => [...previous, ...items]);
    if (items.length)
      setSuccessMessage(
        t("Imported {count} items to the queue.", { count: n(items.length) }),
      );
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
      setErrorMessage(t(routeError));
      return;
    }
    setElapsedTime(0);
    setIsSolvingISP(true);
    setResultsNoticeDismissed(false);
    setErrorMessage(null);
    setSingleOutputDirectory(null);
    const attempt = (attempts.current.get("single") ?? 0) + 1;
    attempts.current.set("single", attempt);
    const execution: ExecutionMetadata = {
      run_id: crypto.randomUUID(),
      benchmark_group_id: mapData.execution?.benchmark_group_id,
      attempt_index: attempt,
      execution_order: ++executionOrder.current,
    };
    setExportGroup(execution.run_id);
    try {
      const response = await solveISP(
        userPath,
        mapData.config,
        mapData.start,
        mapData.goal,
        mapData.grid,
        undefined,
        {
          ...execution,
          map_generation_sec: mapData.generation?.runtime_sec ?? undefined,
        },
      );
      setMapData({
        ...mapData,
        map_image_url:
          response.artifacts.find((url) => url.startsWith("/output/map/")) ||
          "",
        optimal_path:
          response.result.original_optimal_path || mapData.optimal_path,
      });
      setExecutionRecords((previous) => [
        ...previous,
        { group: execution.run_id, result: response.result },
      ]);
      setSingleOutputDirectory(response.output_dir);
      setLastResult(response.result);
      setArtifacts(response.artifacts);
      setCacheKey(Date.now());
      setCurrentStep("results");
    } catch (err) {
      const failed = requestFailure(
        err,
        mapData.config,
        mapData,
        userPath,
        execution,
      );
      setExecutionRecords((previous) => [
        ...previous,
        { group: execution.run_id, result: failed },
      ]);
      setLastResult(failed);
      setCurrentStep("results");
      setErrorMessage(
        presentError(language, err, "Error executing ISP solver"),
      );
    } finally {
      setIsSolvingISP(false);
    }
  }, [mapData, userPath, language, t]);
  async function handleAddToQueue(
    newConfig: SystemConfig,
    useBenchmark: boolean,
  ): Promise<number> {
    setIsGeneratingMap(true);
    setErrorMessage(null);
    try {
      const items = await createExperimentItems(
        newConfig,
        {},
        useBenchmark,
        undefined,
        undefined,
        workflowMode,
      );
      setQueue((previous) => [...previous, ...items]);
      return items.length;
    } catch (error) {
      setErrorMessage(
        presentError(language, error, "Error preparing scenarios"),
      );
      return 0;
    } finally {
      setIsGeneratingMap(false);
    }
  }
  function handleRemoveQueueItem(id: string) {
    const item = queue.find((entry) => entry.id === id);
    const removeItem = () =>
      setQueue((prev) =>
        prev.filter((entry) => !item || !sameReviewGroup(entry, item)),
      );
    if (item?.mapData) {
      setConfirmation({
        title: t("Discard Prepared Item"),
        description: item.benchmarkGroup
          ? t("Discard this scenario group and all its executions?")
          : t("Discard this prepared item?"),
        confirmLabel: t("Discard Item"),
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
    if (queue.some((item) => item.mapData)) {
      setConfirmation({
        title: t("Discard Prepared Items"),
        description: t("Discard the prepared items?"),
        confirmLabel: t("Discard Items"),
        onConfirm: clearQueue,
      });
      return;
    }
    clearQueue();
  }
  async function handleStartBatchReview(items = queue) {
    const firstIndex = items.length ? 0 : -1;
    if (firstIndex < 0) return;
    setIsBatchMode(true);
    setBatchDirectory(null);
    setBatchReviewIndex(firstIndex);
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
        presentError(language, err, "Error generating initial batch map"),
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
          presentError(language, err, "Error generating map for item {item}"),
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
      resetPreparation();
      setSuccessMessage(
        t("Configuration saved to {path}", {
          path: `/configurations/${directoryName(result.saved_files[0])}`,
        }),
      );
      setCurrentStep("config");
    } catch (err) {
      setErrorMessage(
        presentError(language, err, "Error saving configuration"),
      );
    } finally {
      setIsGeneratingMap(false);
    }
  }
  async function handleSaveBatchConfigurations(finalQueue: QueueItem[]) {
    if (finalQueue.some((item) => !item.mapData || !item.userPath?.length)) {
      setErrorMessage(t("Every batch item must have a map and route."));
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
        batch: true,
        configurations,
      });
      resetPreparation();
      setSuccessMessage(
        t("Saved {count} configurations to {path}", {
          count: n(result.saved_files.length),
          path: `/configurations/${directoryName(result.saved_files[0].replace(/[\\/][^\\/]+$/, ""))}/`,
        }),
      );
      setIsBatchMode(false);
      setCurrentStep("config");
    } catch (err) {
      setErrorMessage(
        presentError(language, err, "Error saving batch configurations"),
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
      setBatchRouteFeedback(
        t("Route copied from Map #{map}", { map: n(sourceIdx + 1) }),
      );
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
      t("Route applied to all {count} identical maps", {
        count: n(targetIndices.length + 1),
      }),
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
        t("Review the route for map {map} before solving the batch.", {
          map: n(invalid + 1),
        }),
      );
      return;
    }
    setQueue(finalQueue);
    setElapsedTime(0);
    setIsSolvingISP(true);
    setResultsNoticeDismissed(false);
    setErrorMessage(null);
    let batch = batchDirectory;
    try {
      if (!batch) {
        batch = await createBatch();
        setBatchDirectory(batch);
      }
    } catch (error) {
      setErrorMessage(
        presentError(language, error, "Failed to create batch directory."),
      );
      setIsSolvingISP(false);
      return;
    }
    setExportGroup(batch.output_dir);
    setCurrentStep("results");
    setActiveBatchResultIndex(0);
    for (let i = 0; i < finalQueue.length; i++) {
      const item = finalQueue[i];
      if (item.status === "completed") continue;
      setActiveBatchResultIndex(i);
      setQueue((prev) =>
        prev.map((it, idx) =>
          idx === i
            ? { ...it, status: "solving", error: undefined, result: undefined }
            : it,
        ),
      );
      const execution = nextExecution(
        item.id,
        item.benchmarkGroup ?? item.naming?.benchmark_group_id,
      );
      try {
        const effectivePath = item.userPath || item.mapData?.auto_path || [];
        if (!item.mapData) {
          throw new FrontendError("Batch item has no generated map.");
        }
        const response = await solveISP(
          effectivePath,
          item.config,
          item.mapData.start,
          item.mapData.goal,
          item.mapData.grid,
          { ...item.naming, batch_name: batch.name },
          {
            ...execution,
            map_generation_sec:
              item.mapData.generation?.runtime_sec ?? undefined,
          },
        );
        setExecutionRecords((previous) => [
          ...previous,
          { group: batch.output_dir, result: response.result },
        ]);
        setQueue((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  outputDir: response.output_dir,
                  batchDir: batch.output_dir,
                  mapData: it.mapData
                    ? {
                        ...it.mapData,
                        map_image_url:
                          response.artifacts.find((url) =>
                            url.startsWith("/output/map/"),
                          ) || "",
                      }
                    : undefined,
                  status: executionStatus(response.result),
                  error: response.result.execution_error ?? undefined,
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
        const msg = presentError(language, err, "Batch execution failed");
        const failure = item.mapData
          ? requestFailure(
              err,
              item.config,
              item.mapData,
              item.userPath ?? [],
              execution,
            )
          : undefined;
        if (failure)
          setExecutionRecords((previous) => [
            ...previous,
            { group: batch.output_dir, result: failure },
          ]);
        setQueue((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: "failed",
                  error: msg,
                  result: failure,
                  batchDir: batch.output_dir,
                }
              : it,
          ),
        );
      }
    }
    setIsSolvingISP(false);
  }
  function handleSelectQueueItem(item: QueueItem) {
    if (item.result) {
      if (item.batchDir) {
        setBatchDirectory({
          name: item.batchDir.replace(/\/$/, "").split(/[\\/]/).pop() || "",
          output_dir: item.batchDir,
        });
        setExportGroup(item.batchDir);
        setIsBatchMode(true);
      }
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
  const outputDirectory = isBatchMode
    ? batchDirectory?.output_dir
    : singleOutputDirectory;
  function clearSimulation() {
    setMapData(null);
    setUserPath([]);
    setLastResult(null);
    setArtifacts([]);
    setBatchRouteFeedback(null);
    setIsBatchMode(false);
    setBatchReviewIndex(0);
    setActiveBatchResultIndex(0);
    setExecutionRecords([]);
    setExportGroup("");
    setBatchDirectory(null);
    setSingleOutputDirectory(null);
    setElapsedTime(0);
    setErrorMessage(null);
    executionOrder.current = 0;
    attempts.current.clear();
  }
  function resetPreparation() {
    clearSimulation();
    setConfigurationQueue([]);
    setConfig(initialConfigRef.current);
    setBenchmark(false);
  }
  function handleSelectStep(step: "config" | "route_canvas" | "results") {
    if (isSolvingISP || isGeneratingMap) return;
    if (
      step === "config" &&
      workflowMode === "run" &&
      executionRecords.length > 0
    ) {
      setConfirmation({
        title: t("Return to Configuration"),
        description: t(
          "The current results and routes will be lost. Return to configuration?",
        ),
        confirmLabel: t("Return to Configuration"),
        onConfirm: () => {
          clearSimulation();
          setRunQueue([]);
          setSuccessMessage(null);
          setCurrentStep("config");
        },
      });
      return;
    }
    if (currentStep === "route_canvas" && isBatchMode) {
      setQueue((previous) =>
        previous.map((item) =>
          sameReviewGroup(item, queue[batchReviewIndex])
            ? { ...item, userPath }
            : item,
        ),
      );
    }
    setCurrentStep(step);
  }
  function openQuestionnaires() {
    if (isSolvingISP || isGeneratingMap) return;
    setShowAdmin(true);
  }
  if (showAdmin) {
    return (
      <LanguageProvider language="en">
        <QuestionnaireAdmin
          currentStep={currentStep}
          hasMapData={hasMapData}
          hasResults={hasResults}
          onSelectStep={(step) => {
            setShowAdmin(false);
            handleSelectStep(step);
          }}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
        <AboutModal
          isOpen={isAboutOpen}
          onClose={() => setIsAboutOpen(false)}
        />
      </LanguageProvider>
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
        onOpenAdmin={openQuestionnaires}
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
              aria-label={t("Dismiss error message")}
            >
              &times;
            </button>
          </div>
        )}
        {successMessage && currentStep === "config" && (
          <div className="queue-banner" role="status">
            <span className="alert-text">{successMessage}</span>
            <button
              type="button"
              className="alert-close"
              onClick={() => setSuccessMessage(null)}
              aria-label={t("Dismiss success message")}
            >
              &times;
            </button>
          </div>
        )}
        {currentStep === "results" &&
          outputDirectory &&
          !resultsNoticeDismissed && (
            <div className="queue-banner" role="status">
              <span className="alert-text">
                {t("Results saved to {path}", {
                  path: `/results/${directoryName(outputDirectory)}/`,
                })}
              </span>
              <button
                type="button"
                className="alert-close"
                onClick={() => setResultsNoticeDismissed(true)}
                aria-label={t("Dismiss results location")}
              >
                &times;
              </button>
            </div>
          )}

        {currentStep === "config" && (
          <div key="step-config" className="step-container config-step">
            <ConfigForm
              benchmark={benchmark}
              onBenchmarkChange={setBenchmark}
              onBeforeGenerate={(action) => {
                if (!mapData && queue.length === 0) {
                  action();
                  return;
                }
                setConfirmation({
                  title: t("Generate New Maps"),
                  description: t(
                    "Discard the current simulation and generate new maps?",
                  ),
                  confirmLabel: t("Generate New Maps"),
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
              queueCount={groupQueue(queue).length}
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
                      sameReviewGroup(item, queue[batchReviewIndex])
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
                if (workflowMode === "run" && executionRecords.length > 0) {
                  handleSelectStep("config");
                  return;
                }
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
                returnToConfig();
              }}
              busyButtonText={
                workflowMode === "create"
                  ? t("Saving Configuration...")
                  : t("Solving ISP...")
              }
              solveButtonText={
                workflowMode === "create"
                  ? isBatchMode
                    ? reviewIndices(queue).some(
                        (index) => index > batchReviewIndex,
                      )
                      ? t("Save Route & Next Map ({current}/{total})", {
                          current: n(reviewPosition + 2),
                          total: n(reviewSteps.length),
                        })
                      : t("Save Batch Configurations")
                    : t("Save Configuration")
                  : isBatchMode
                    ? reviewIndices(queue).some(
                        (index) => index > batchReviewIndex,
                      )
                      ? t("Save Route & Next Map →")
                      : t("Solve Batch ({count} Runs)", {
                          count: n(queue.length),
                        })
                    : t("Solve ISP")
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
                                ? t(
                                    "Configuration Route Setup, Map {current} of {total}",
                                    {
                                      current: n(reviewPosition + 1),
                                      total: n(reviewSteps.length),
                                    },
                                  )
                                : t(
                                    "Batch Route Setup - Map {current} of {total}",
                                    {
                                      current: n(reviewPosition + 1),
                                      total: n(reviewSteps.length),
                                    },
                                  )}
                            </span>
                            <span className="batch-stepper-sub">
                              {workflowMode === "create"
                                ? t(
                                    "Define one route per map; Benchmark combinations share that route.",
                                  )
                                : t(
                                    "Define custom routes for all maps in the batch before solving.",
                                  )}
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
                                  className={`batch-step-btn ${isActive ? "active" : ""}`}
                                  onClick={() => handleSwitchBatchMap(idx)}
                                  disabled={isGeneratingMap || isSolvingISP}
                                >
                                  <span>
                                    {workflowMode === "create"
                                      ? t("Item {item} ({height}x{width})", {
                                          item: n(idx + 1),
                                          height: n(item.config.MAP_H),
                                          width: n(item.config.MAP_W),
                                        })
                                      : t(
                                          "Map {map} ({height}x{width}){suffix}",
                                          {
                                            map: n(
                                              reviewSteps.indexOf(idx) + 1,
                                            ),
                                            height: n(item.config.MAP_H),
                                            width: n(item.config.MAP_W),
                                            suffix:
                                              item.groupKind === "benchmark"
                                                ? t(" · 17 scenarios")
                                                : item.groupKind ===
                                                    "comparison"
                                                  ? t(" · 3 scenarios")
                                                  : "",
                                          },
                                        )}
                                  </span>
                                  <span
                                    className={`batch-step-status-pill ${isItemConnected ? "ready" : "pending"}`}
                                  >
                                    {isItemConnected
                                      ? t("Ready")
                                      : t("Pending")}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {matchingBatchIndices.length > 0 && (
                            <div
                              className={`batch-identical-maps-banner ${areAllMatchingSynced ? "is-synced" : ""}`}
                            >
                              <div className="identical-maps-top-row">
                                <div className="identical-maps-info">
                                  <span className="identical-maps-title">
                                    {areAllMatchingSynced
                                      ? t(
                                          "Route Synchronized Across All Identical Maps",
                                        )
                                      : t("Identical Map Geometry Detected")}
                                  </span>
                                  <span className="identical-maps-desc">
                                    {areAllMatchingSynced
                                      ? t(
                                          "All {maps} identical maps in this batch share this exact verified route ({steps} steps).",
                                          {
                                            maps: n(
                                              matchingBatchIndices.length + 1,
                                            ),
                                            steps: n(userPath.length),
                                          },
                                        )
                                      : matchingRunWithRoute &&
                                          !isSyncedWithSource
                                        ? t(
                                            "Map #{map} has a verified route ({steps} steps). You can copy it with 1 click, or keep a custom route.",
                                            {
                                              map: n(
                                                matchingRunWithRoute.idx + 1,
                                              ),
                                              steps: n(
                                                matchingRunWithRoute.item
                                                  .userPath?.length ?? 0,
                                              ),
                                            },
                                          )
                                        : t(
                                            "Maps {maps} share this exact terrain & obstacles. You can draw once and apply to all.",
                                            {
                                              maps: [
                                                batchReviewIndex + 1,
                                                ...matchingBatchIndices.map(
                                                  (m) => m.idx + 1,
                                                ),
                                              ]
                                                .sort()
                                                .map((index) => `#${n(index)}`)
                                                .join(", "),
                                            },
                                          )}
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
                                      title={t("Copy route from Map #{map}", {
                                        map: n(matchingRunWithRoute.idx + 1),
                                      })}
                                    >
                                      {t("Copy Route from Map #{map}", {
                                        map: n(matchingRunWithRoute.idx + 1),
                                      })}
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
                                  title={t(
                                    "Apply current route to all matching runs",
                                  )}
                                >
                                  {areAllMatchingSynced
                                    ? t("Re-apply to All Identical Maps")
                                    : t(
                                        "Apply Route to All {count} Identical Maps",
                                        {
                                          count: n(
                                            matchingBatchIndices.length + 1,
                                          ),
                                        },
                                      )}
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
            <ResultsView
              records={executionRecords
                .filter((record) => record.group === exportGroup)
                .map((record) => record.result)}
              outputDirectory={outputDirectory}
              result={lastResult}
              mapData={
                isBatchMode ? queue[activeBatchResultIndex]?.mapData : mapData
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
              onNewRun={() => handleSelectStep("config")}
              batchQueue={isBatchMode && queue.length > 0 ? queue : undefined}
              activeBatchIndex={activeBatchResultIndex}
              onSelectBatchIndex={(idx) => {
                setActiveBatchResultIndex(idx);
                if (queue[idx]?.result) {
                  setLastResult(queue[idx].result!);
                  setArtifacts(queue[idx].artifacts || []);
                }
              }}
              elapsedTime={elapsedTime}
              isSolving={isSolvingISP}
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
              {isGeneratingMap
                ? t("Generating Map...")
                : t("Solving ISP Model...")}
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
                ? t("Iterative / Incremental MILP")
                : t("Standard Monolithic MILP");
              const astarScope =
                activeConfig.USE_INCREMENTAL_SOLVER &&
                activeConfig.DEFAULT_REDUCTION_METHOD !== "NONE"
                  ? activeConfig.INCREMENTAL_ASTAR_SCOPE === "SUBGRAPH"
                    ? t("Reduced Subgraph")
                    : t("Global Grid")
                  : null;
              const h = activeConfig.MAP_H ?? 20;
              const w = activeConfig.MAP_W ?? 20;
              const seed = activeConfig.MAP_DEFAULT_SEED ?? 42;
              return (
                <div className="loading-params-summary">
                  <span className="loading-param-chip">
                    {t("Reduction Method:")} {t(reduction)}
                  </span>
                  <span className="loading-param-chip">
                    {t("Solver Mode:")} {solverMode}
                  </span>
                  {astarScope && (
                    <span className="loading-param-chip">
                      {t("A* Scope:")} {astarScope}
                    </span>
                  )}
                  <span className="loading-param-chip">
                    {t("Grid Dimension:")} {n(h)}×{n(w)} ({t("Seed:")} {n(seed)}
                    )
                  </span>
                </div>
              );
            })()}
            <p className="loading-overlay-desc">
              {isGeneratingMap
                ? t(
                    "Preparing terrain, elevation and routes. Larger maps may take longer.",
                  )
                : t(
                    "Solving ISP formulation via Mixed-Integer Linear Programming (MILP). Because the inverse problem under discrete terrain attributes is NP-hard, solving large grids or runs without graph reduction explores a large combinatorial space and may take several minutes depending on hardware. Please wait...",
                  )}
            </p>
            <div className="loading-elapsed-timer">
              {t("Elapsed time:")} <strong>{n(elapsedTime)}s</strong>
            </div>
          </div>
        </div>
      )}

      {confirmation && (
        <ConfirmModal
          key={confirmation.title}
          {...confirmation}
          busy={isGeneratingMap || isSolvingISP}
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
