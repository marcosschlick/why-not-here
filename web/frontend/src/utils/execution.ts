import type {
  ExecutionMetadata,
  LastResult,
  MapData,
  SystemConfig,
} from "../types";

export function requestFailure(
  error: unknown,
  config: SystemConfig,
  map: MapData,
  path: [number, number][],
  execution: ExecutionMetadata,
): LastResult {
  const message =
    error instanceof Error ? error.message : "Execution request failed.";
  return {
    execution_status: "failed",
    execution_error: message,
    success: false,
    solver_status: "UNKNOWN",
    runtime_sec: null,
    iterations: null,
    explanation_text: message,
    metrics: {
      identity: execution,
      model: config.ISP_MODEL ?? "NORMAL",
      strategy: config.USE_INCREMENTAL_SOLVER ? "INCREMENTAL" : "MONOLITHIC",
      reduction: config.DEFAULT_REDUCTION_METHOD,
      stop_reason: "REQUEST_ERROR",
      validation_status: "UNKNOWN",
      objective_certified: false,
      certificate_reason:
        "The request failed; the server computation state is unknown.",
      reproduction: {
        configuration: config,
        desired_path: path,
        start: map.start,
        goal: map.goal,
        base_seed: map.generation?.base_seed,
        effective_seed: map.generation?.effective_seed,
      },
      error: message,
    },
  };
}

export function executionStatus(result: LastResult): "completed" | "failed" {
  return result.execution_status === "failed" ? "failed" : "completed";
}

export function scientificOutcome(
  result: LastResult,
): "validated" | "infeasible" | "inconclusive" | "stopped" | "error" {
  if (executionStatus(result) === "failed") return "error";
  if (result.metrics?.validation_status === "VALID") return "validated";
  if (
    result.solver_status === "INFEASIBLE" ||
    result.metrics?.stop_reason === "BLOCKED_ENDPOINT"
  )
    return "infeasible";
  if (
    [
      "TIME_BUDGET_EXHAUSTED",
      "TIME_LIMIT",
      "SOLVER_LIMIT",
      "INTERRUPTED",
    ].includes(result.metrics?.stop_reason ?? "")
  )
    return "stopped";
  return "inconclusive";
}

export function scientificOutcomeLabel(result: LastResult): string {
  const outcome = scientificOutcome(result);
  if (outcome === "validated") return "Validated";
  if (outcome === "infeasible") return "Infeasible";
  if (outcome === "error") return "Execution error";
  if (outcome === "stopped")
    return result.metrics?.stop_reason === "INTERRUPTED"
      ? "Interrupted"
      : "Stopped by limit";
  return "Inconclusive";
}
