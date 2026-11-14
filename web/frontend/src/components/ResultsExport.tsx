import { useState } from "react";
import type { LastResult } from "../types";
import { exportScenarioResults } from "../services/api";
import { presentError, useI18n } from "../i18n";

export function ResultsExport({
  records,
  isSolving,
  name,
}: {
  records: LastResult[];
  isSolving: boolean;
  name: string;
}) {
  const { language, t, n } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      await exportScenarioResults(records, name);
    } catch (reason) {
      setError(presentError(language, reason, "Export failed."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="scenario-export-actions">
      <div className="scenario-export-info">
        <span>
          {t("{count} recorded {kind} · includes unsuccessful attempts", {
            count: n(records.length),
            kind: records.length === 1 ? t("execution") : t("executions"),
          })}
        </span>
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={isSolving || busy || records.length === 0}
        title={
          isSolving
            ? t("Export is available after all scenarios finish.")
            : undefined
        }
        onClick={() => void download()}
      >
        {t("Export Results (CSV)")}
      </button>
      {error && (
        <span className="scenario-export-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
