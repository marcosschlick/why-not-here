export function formatReductionMethod(method?: string): string {
  switch (method?.toUpperCase()) {
    case "BBOX":
      return "Bounding Box";
    case "FLOODFILL":
      return "Reachable Set (Floodfill)";
    case "SPARSIFIED":
      return "Sparsified Graph";
    case "PATH_ONLY":
      return "Path Only";
    case "NONE":
      return "None (Full Graph)";
    default:
      return method || "None (Full Graph)";
  }
}

export function formatValidationScope(scope?: string | null): string {
  if (scope === "GLOBAL") return "Global A*";
  if (scope === "SUBGRAPH") return "Subgraph A*";
  return "A* scope unavailable";
}

export function configuredValidationScope(config: { DEFAULT_REDUCTION_METHOD: string; INCREMENTAL_ASTAR_SCOPE?: string }): string {
  return config.DEFAULT_REDUCTION_METHOD === "NONE" ? "GLOBAL" : (config.INCREMENTAL_ASTAR_SCOPE ?? "GLOBAL");
}

export function directoryName(path?: string | null): string {
  return path?.replace(/\/$/, "").split(/[\\/]/).pop() || "scenario";
}
