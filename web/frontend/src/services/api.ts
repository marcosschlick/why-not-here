import type {
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
