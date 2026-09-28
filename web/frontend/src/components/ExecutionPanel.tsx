import { type FormEvent, useState } from "react";

interface ExecutionPanelProps {
  isRunning: boolean;
  statusText: string;
  onRun: (runs: number) => Promise<void>;
}

export function ExecutionPanel({
  isRunning,
  statusText,
  onRun,
}: ExecutionPanelProps) {
  const [runs, setRuns] = useState(1);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isRunning || runs < 1) {
      return;
    }
    await onRun(runs);
  }

  return (
    <form onSubmit={handleSubmit} className="execution-form">
      <fieldset>
        <legend>Execução</legend>
        <div className="execution-controls">
          <div className="form-group inline">
            <label htmlFor="runsInput">Quantidade de execuções</label>
            <input
              id="runsInput"
              type="number"
              min={1}
              value={runs}
              onChange={(e) => setRuns(Math.max(1, Number(e.target.value)))}
              disabled={isRunning}
              required
            />
          </div>
          <button type="submit" disabled={isRunning}>
            Executar Pipeline
          </button>
        </div>
        <div className="execution-status">
          <strong>Status: </strong>
          <span>{statusText || "Pronto"}</span>
        </div>
      </fieldset>
    </form>
  );
}
