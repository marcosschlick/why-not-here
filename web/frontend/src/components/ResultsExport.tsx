import { useState } from "react";
import type { LastResult } from "../types";
import { exportScenarioResults } from "../services/api";

export function ResultsExport({ records }: { records: LastResult[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download(kind: "scenarios" | "iterations") {
    setBusy(true);
    setError("");
    try {
      await exportScenarioResults(records, kind);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="scenario-export-actions">
      <span>
        {records.length} recorded execution{records.length === 1 ? "" : "s"} ·
        includes unsuccessful attempts
      </span>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy || records.length === 0}
        onClick={() => void download("scenarios")}
      >
        Export Scenarios (CSV)
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy || records.length === 0}
        onClick={() => void download("iterations")}
      >
        Export Iterations (CSV)
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
