import type {
  MapData,
  NamingMetadata,
  QueueItem,
  SystemConfig,
} from "../types";

export function createExperimentItems(
  config: SystemConfig,
  naming: NamingMetadata,
  benchmark: boolean,
  mapData?: MapData,
  userPath?: [number, number][],
): QueueItem[] {
  const group = crypto.randomUUID();
  const variants = benchmark
    ? [false, true].flatMap((incremental) =>
        ["NONE", "PATH_ONLY", "SPARSIFIED", "BBOX", "FLOODFILL"].map(
          (reduction) => ({ incremental, reduction }),
        ),
      )
    : [
        {
          incremental: config.USE_INCREMENTAL_SOLVER,
          reduction: config.DEFAULT_REDUCTION_METHOD,
        },
      ];
  return variants.map(({ incremental, reduction }, index) => {
    const parameters = {
      ...config,
      USE_INCREMENTAL_SOLVER: incremental,
      DEFAULT_REDUCTION_METHOD: reduction,
    };
    return {
      id: `${group}-${index}`,
      benchmarkGroup: benchmark ? group : undefined,
      naming: { ...naming, benchmark },
      config: parameters,
      mapData: mapData ? { ...mapData, config: parameters } : undefined,
      userPath,
      status: mapData ? "awaiting_route" : "pending",
    };
  });
}

export function sameReviewGroup(item: QueueItem, current: QueueItem): boolean {
  return (
    item.id === current.id ||
    Boolean(
      current.benchmarkGroup && item.benchmarkGroup === current.benchmarkGroup,
    )
  );
}

export function reviewIndices(queue: QueueItem[]): number[] {
  const seen = new Set<string>();
  return queue.flatMap((item, index) => {
    const key = item.benchmarkGroup || item.id;
    if (item.scenarioId || seen.has(key)) return [];
    seen.add(key);
    return [index];
  });
}

export function groupQueue(queue: QueueItem[]): QueueItem[][] {
  const groups = new Map<string, QueueItem[]>();
  for (const item of queue) {
    const key = item.benchmarkGroup ?? item.id;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.values());
}
