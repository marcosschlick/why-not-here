import type {
  MapData,
  NamingMetadata,
  QueueItem,
  SystemConfig,
} from "../types";
import { planScenarioConfigurations } from "../services/api";

export async function createExperimentItems(
  config: SystemConfig,
  naming: NamingMetadata,
  benchmark: boolean,
  mapData?: MapData,
  userPath?: [number, number][],
  purpose: "run" | "create" = "run",
): Promise<QueueItem[]> {
  const group = crypto.randomUUID();
  const variants = await planScenarioConfigurations(config, benchmark, purpose);
  const grouped = benchmark || variants.length > 1;
  return variants.map<QueueItem>((parameters, index) => ({
    id: `${group}-${index}`,
    benchmarkGroup: grouped ? group : undefined,
    groupKind: benchmark ? "benchmark" : grouped ? "comparison" : undefined,
    naming: {
      ...naming,
      benchmark: grouped,
      benchmark_group_id: grouped ? group : naming.benchmark_group_id,
    },
    config: parameters,
    mapData: mapData ? { ...mapData, config: parameters } : undefined,
    userPath,
    status: mapData ? "awaiting_route" : "pending",
  }));
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
    if (seen.has(key)) return [];
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
