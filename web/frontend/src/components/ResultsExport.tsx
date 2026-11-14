import { useState } from "react";
import type { LastResult } from "../types";
import { exportScenarioResults } from "../services/api";

export function ResultsExport({
  records,
  isSolving,
}: {
  records: LastResult[];
  isSolving: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      await exportScenarioResults(records);
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
        disabled={isSolving || busy || records.length === 0}
        title={isSolving ? "Export is available after all scenarios finish." : undefined}
        onClick={() => void download()}
      >
        Export Results (CSV)
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
