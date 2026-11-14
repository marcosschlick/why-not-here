import type { QueueItem } from "../types";
import { scientificOutcomeLabel } from "../utils/execution";
import { groupQueue } from "../utils/experiments";
interface QueuePanelProps {
  queue: QueueItem[];
  workflowMode: "run" | "create";
  currentIndex: number;
  isProcessing: boolean;
  interactiveMode: boolean;
  onToggleInteractiveMode: (val: boolean) => void;
  onRemoveItem: (id: string) => void;
  onClearQueue: () => void;
  onStartQueue: () => void;
  onSelectItem?: (item: QueueItem) => void;
}
export function QueuePanel({
  queue,
  workflowMode,
  currentIndex,
  isProcessing,
  interactiveMode,
  onToggleInteractiveMode,
  onRemoveItem,
  onClearQueue,
  onStartQueue,
  onSelectItem,
}: QueuePanelProps) {
  if (queue.length === 0) {
    return (
      <div className="queue-empty-card">
        <p className="queue-empty-text">
          {workflowMode === "create"
            ? "The configuration queue is empty. Configure the parameters above and add configurations to the batch."
            : "The execution queue is empty. Configure the parameters above and click + Add to Queue to enqueue batch configurations."}
        </p>
      </div>
    );
  }
  const groups = groupQueue(queue);
  const currentGroupIndex = groups.findIndex((group) =>
    group.includes(queue[currentIndex]),
  );
  const completedCount = queue.filter(
    (item) =>
      item.status === "completed" ||
      item.status === "failed",
  ).length;
  const progressPercent = Math.round((completedCount / queue.length) * 100);
  return (
    <div className="queue-panel-container">
      <div className="queue-panel-header">
        <div>
          <h3>
            {workflowMode === "create"
              ? "Configuration Queue"
              : "Batch Execution Queue"}{" "}
            ({groups.length} {groups.length === 1 ? "item" : "items"})
          </h3>
          <p className="subtitle">
            {workflowMode === "create"
              ? "Review each route, then save the configuration files."
              : "Sequential pipeline execution across parameterized runs."}
          </p>
        </div>

        <div className="queue-header-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClearQueue}
            disabled={isProcessing}
          >
            Clear Queue
          </button>

          <button
            type="button"
            className="btn btn-vibrant"
            onClick={onStartQueue}
            disabled={isProcessing || queue.length === 0}
          >
            {isProcessing
              ? workflowMode === "create"
                ? `Preparing Routes (${currentGroupIndex + 1}/${groups.length})...`
                : `Running Queue (${currentGroupIndex + 1}/${groups.length})...`
              : workflowMode === "create"
                ? `Review Routes (${groups.length} ${groups.length === 1 ? "item" : "items"})`
                : `Run Queue (${groups.length} ${groups.length === 1 ? "item" : "items"})`}
          </button>
        </div>
      </div>

      {workflowMode === "run" && (
        <div className="queue-options-row">
          <button
            type="button"
            role="switch"
            aria-checked={interactiveMode}
            className={`toggle-btn ${interactiveMode ? "active" : ""}`}
            onClick={() =>
              !isProcessing && onToggleInteractiveMode(!interactiveMode)
            }
            disabled={isProcessing}
          >
            <span className="switch-pill">
              <span className="switch-knob" />
            </span>
            <span className="toggle-label">
              Interactive Verification:{" "}
              {interactiveMode
                ? "Enabled (pause per run to inspect/modify route)"
                : "Disabled (automatic execution)"}
            </span>
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="queue-progress-bar-container">
          <div className="queue-progress-info">
            <span>
              Processing Item {currentGroupIndex + 1} of {groups.length} (
              {completedCount} of {queue.length} runs finished)
            </span>
            <span>{progressPercent}% Completed</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="progress-fill"
              style={{ transform: `scaleX(${progressPercent / 100})` }}
            />
          </div>
        </div>
      )}

      <div className="queue-items-list">
        {groups.map((group, index) => {
          const item = group[0];
          const isGroup = Boolean(item.benchmarkGroup);
          const isBenchmark = item.groupKind === "benchmark";
          const isCurrent = isProcessing && group.includes(queue[currentIndex]);
          const active = group.find(
            (entry) =>
              entry.status === "solving" || entry.status === "generating_map",
          );
          const allFinished = group.every((entry) =>
            ["completed", "failed"].includes(entry.status),
          );
          const status = !isGroup
            ? item.status
            : (active?.status ??
              (allFinished
                ? group.some((entry) => entry.status === "failed")
                  ? "failed"
                  : "completed"
                : group.some((entry) => entry.status === "awaiting_route")
                  ? "awaiting_route"
                  : "pending"));
          const statusLabels: Record<string, string> = {
            pending: "Pending",
            generating_map: "Generating map...",
            awaiting_route: "Awaiting route",
            solving: "Solving ISP...",
            completed: "Completed",
            failed: "Failed",
          };
          return (
            <div
              key={item.id}
              className={`queue-item-card ${isCurrent ? "current" : ""} status-${status}`}
              onClick={() => onSelectItem && onSelectItem(item)}
            >
              <div className="queue-item-header">
                <span className="queue-item-index">#{index + 1}</span>
                <span className={`status-pill ${status}`}>
                  {statusLabels[status] || status}
                </span>
              </div>

              <div className="queue-item-params">
                <span className="param-tag">
                  {item.config.MAP_H}x{item.config.MAP_W}
                </span>
                <span className="param-tag">
                  {item.config.CONNECTIVITY}-Connected
                </span>
                <span className="param-tag">
                  Seed: #{item.config.MAP_DEFAULT_SEED}
                </span>
                {isGroup ? (
                  <span className="param-tag">
                    {isBenchmark ? "Benchmark" : "Scenario comparison"} ·{" "}
                    {group.length}{" "}
                    {workflowMode === "create"
                      ? "configurations"
                      : "executions"}
                  </span>
                ) : (
                  <>
                    <span className="param-tag">
                      Reduction: {item.config.DEFAULT_REDUCTION_METHOD}
                    </span>
                    <span className="param-tag">
                      {item.config.USE_INCREMENTAL_SOLVER
                        ? "Incremental"
                        : "Monolithic"}
                    </span>
                  </>
                )}
                {!isGroup && item.outputDir && (
                  <span className="param-tag">Dir: {item.outputDir}</span>
                )}
              </div>

              {!isGroup && item.result && (
                <div className="queue-item-result-snippet">
                  <span>
                    Result:{" "}
                    <strong>{scientificOutcomeLabel(item.result)}</strong>{" "}
                    &bull; Time:{" "}
                    {item.result.runtime_sec == null
                      ? "Unavailable"
                      : `${item.result.runtime_sec}s`}{" "}
                    &bull; Iter: {item.result.iterations ?? "Unavailable"}
                  </span>
                </div>
              )}

              {!isProcessing && (
                <button
                  type="button"
                  className="btn-remove-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveItem(item.id);
                  }}
                  title={
                    item.benchmarkGroup
                      ? "Remove every scenario in this group"
                      : "Remove configuration from queue"
                  }
                  aria-label={
                    item.benchmarkGroup
                      ? "Remove scenario group"
                      : "Remove item"
                  }
                >
                  &times;
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
