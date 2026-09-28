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

export function formatSolverType(
  useIncremental?: boolean,
  solverName?: string,
): string {
  const solver = solverName || "HiGHS";
  return useIncremental
    ? `Iterative / Incremental MILP (${solver})`
    : `Standard Monolithic MILP (${solver})`;
}
