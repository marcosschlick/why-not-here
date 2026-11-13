import type { MapData, OutputTarget, QueueItem, SystemConfig } from "../types";

export function experimentName(height: number, width: number): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `experiment-${height}x${width}-${date}-${time}`;
}

export function outputPath(output: OutputTarget): string {
  return `${output.directory.replace(/[\\/]+$/, "")}/${output.name}`;
}

export function createExperimentItems(
  config: SystemConfig,
  output: OutputTarget,
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
    const target = {
      ...output,
      name: benchmark
        ? `${output.name}-${incremental ? "incremental" : "monolithic"}-${reduction.toLowerCase()}`
        : output.name,
    };
    const parameters = {
      ...config,
      USE_INCREMENTAL_SOLVER: incremental,
      DEFAULT_REDUCTION_METHOD: reduction,
      OUTPUT_DIR: outputPath(target),
    };
    return {
      id: `${group}-${index}`,
      benchmarkGroup: benchmark ? group : undefined,
      output: target,
      configurationName: target.name,
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
