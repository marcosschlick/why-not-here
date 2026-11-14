import type {
  ExecutionMetadata,
  LastResult,
  ImportConfigResponse,
  MapData,
  MapProfile,
  NamingMetadata,
  SaveConfigurationsPayload,
  SolveResponse,
  SystemConfig,
} from "../types";

export async function fetchMapProfiles(): Promise<MapProfile[]> {
  const response = await fetch("/api/map-profiles");
  if (!response.ok) throw new Error("Failed to load automatic map profiles.");
  return response.json();
}

export async function fetchConfig(): Promise<SystemConfig> {
  const response = await fetch("/api/config");
  if (!response.ok) {
    throw new Error(`Failed to fetch configuration: ${response.statusText}`);
  }
  return response.json();
}

export async function generateMap(
  config: Partial<SystemConfig>,
  persistArtifacts = false,
): Promise<MapData> {
  const response = await fetch("/api/map/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...config, persist_artifacts: persistArtifacts }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      errorData?.detail || `Failed to generate map: ${response.statusText}`,
    );
  }
  return response.json();
}

export async function solveISP(
  userPath: [number, number][] | null,
  config?: Partial<SystemConfig>,
  start?: [number, number],
  goal?: [number, number],
  map?: Record<string, unknown>,
  naming?: NamingMetadata,
  execution?: ExecutionMetadata,
): Promise<SolveResponse> {
  const response = await fetch("/api/isp/solve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_path: userPath,
      map,
      config: config || null,
      start,
      goal,
      naming,
      execution,
    }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      errorData?.detail ||
        `Failed to execute ISP solver: ${response.statusText}`,
    );
  }
  return response.json();
}

export async function solveScenarioISP(
  questionnaireId: number,
  map: MapData,
  userPath: [number, number][],
): Promise<SolveResponse> {
  const response = await fetch(
    `/api/questionnaires/${questionnaireId}/scenario-solve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        map: map.grid,
        user_path: userPath,
        start: map.start,
        goal: map.goal,
      }),
    },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Unable to resolve the scenario: ${response.statusText}`,
    );
  }
  if (
    !["completed", "failed"].includes(data?.status) ||
    typeof data.result?.success !== "boolean" ||
    typeof data.result.solver_status !== "string" ||
    !data.result.solver_status.trim()
  ) {
    throw new Error(
      "The API returned an invalid scenario resolution response.",
    );
  }
  return data as SolveResponse;
}

export async function saveConfigurations(
  payload: SaveConfigurationsPayload,
): Promise<{ status: string; saved_files: string[] }> {
  const response = await fetch("/api/config/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      errorData?.detail ||
        `Failed to save configuration: ${response.statusText}`,
    );
  }
  return response.json();
}

export async function importConfig(
  payload: Record<string, unknown>,
  persistArtifacts = false,
): Promise<ImportConfigResponse> {
  const response = await fetch("/api/config/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...payload, persist_artifacts: persistArtifacts }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      errorData?.detail ||
        `Failed to import configuration: ${response.statusText}`,
    );
  }
  return response.json();
}

export async function exportScenarioResults(
  records: LastResult[],
): Promise<void> {
  const compact = records.map(({ prepared_grid, modified_grid, ...record }) => {
    void prepared_grid;
    void modified_grid;
    return record;
  });
  const response = await fetch("/api/benchmarks/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: compact }),
  });
  if (!response.ok) throw new Error("Failed to export scenario results.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "scenarios.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function planScenarioConfigurations(
  config: SystemConfig,
  benchmark: boolean,
  purpose: "run" | "create",
): Promise<SystemConfig[]> {
  const response = await fetch("/api/config/scenarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: { ...config, ISP_MODEL: "NORMAL" },
      benchmark,
      purpose,
    }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.detail || "Failed to prepare scenario configurations.",
    );
  }
  return (await response.json()).configurations;
}
