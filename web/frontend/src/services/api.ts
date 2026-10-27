import type {
  DirectoryListing,
  ExecutionStatus,
  ExportConfigPayload,
  ImportConfigResponse,
  MapData,
  SaveConfigurationsPayload,
  SolveResponse,
  SystemConfig,
} from "../types";

export async function fetchConfig(): Promise<SystemConfig> {
  const response = await fetch("/api/config");
  if (!response.ok) {
    throw new Error(`Failed to fetch configuration: ${response.statusText}`);
  }
  return response.json();
}

export async function saveConfig(
  payload: Partial<SystemConfig>,
): Promise<void> {
  const response = await fetch("/api/config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Failed to save configuration: ${response.statusText}`);
  }
}

export async function generateMap(
  config: Partial<SystemConfig>,
  persistArtifacts = true,
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
): Promise<SolveResponse> {
  const response = await fetch("/api/isp/solve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_path: userPath,
      config: config || null,
      start,
      goal,
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

export async function fetchDirectories(
  path?: string,
): Promise<DirectoryListing> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  const response = await fetch(`/api/fs/directories${query}`);
  if (!response.ok) {
    throw new Error(`Failed to list directories: ${response.statusText}`);
  }
  return response.json();
}

export async function createDirectory(
  name: string,
  parent: string,
): Promise<string> {
  const response = await fetch("/api/fs/create-dir", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, parent }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create directory: ${response.statusText}`);
  }
  const data = await response.json();
  return data.path;
}

export async function browseDirectory(): Promise<string | null> {
  try {
    const response = await fetch("/api/browse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "directory" }),
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.path || null;
  } catch {
    return null;
  }
}

export async function browseFiles(
  multiple = false,
): Promise<
  | { name: string; data: Record<string, unknown> }[]
  | { name: string; data: Record<string, unknown> }
  | null
> {
  try {
    const response = await fetch("/api/browse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: multiple ? "files" : "file" }),
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (multiple) {
      return data.files || [];
    }
    if (data.data) {
      return { name: data.name, data: data.data };
    }
    return null;
  } catch {
    return null;
  }
}

export async function triggerRun(runs: number): Promise<void> {
  const response = await fetch("/api/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ runs }),
  });
  if (!response.ok) {
    throw new Error(`Failed to start execution: ${response.statusText}`);
  }
}

export async function fetchStatus(): Promise<ExecutionStatus> {
  const response = await fetch("/api/status");
  if (!response.ok) {
    throw new Error(`Failed to fetch execution status: ${response.statusText}`);
  }
  return response.json();
}

export async function checkOutputDir(
  path: string,
): Promise<import("../types").CheckDirResult> {
  const query = `?path=${encodeURIComponent(path.trim())}`;
  const response = await fetch(`/api/fs/check-output-dir${query}`);
  if (!response.ok) {
    return { exists: false, file_count: 0, has_artifacts: false, files: [] };
  }
  return response.json();
}

export async function cleanOutputDir(
  path: string,
): Promise<{ status: string; deleted_count: number }> {
  const response = await fetch("/api/fs/clean-output-dir", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: path.trim() }),
  });
  if (!response.ok) {
    throw new Error(`Failed to clean output directory: ${response.statusText}`);
  }
  return response.json();
}

export async function exportConfig(
  payload: ExportConfigPayload,
): Promise<Record<string, unknown>> {
  const response = await fetch("/api/config/export", {
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
        `Failed to export configuration: ${response.statusText}`,
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
  persistArtifacts = true,
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
