import type { QueueItem } from "../types";

interface QueuePanelProps {
  queue: QueueItem[];
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
          The execution queue is empty. Configure the parameters above and click{" "}
          <strong>&quot;+ Add to Queue&quot;</strong> to enqueue batch
          configurations.
        </p>
      </div>
    );
  }

  const completedCount = queue.filter(
    (item) => item.status === "completed",
  ).length;
  const progressPercent = Math.round((completedCount / queue.length) * 100);

  return (
    <div className="queue-panel-container">
      <div className="queue-panel-header">
        <div>
          <h3>
            Batch Execution Queue ({queue.length}{" "}
            {queue.length === 1 ? "item" : "items"})
          </h3>
          <p className="subtitle">
            Sequential pipeline execution across parameterized runs.
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
              ? `Running Queue (${currentIndex + 1}/${queue.length})...`
              : `Run Queue (${queue.length} ${queue.length === 1 ? "item" : "items"})`}
          </button>
        </div>
      </div>

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

      {isProcessing && (
        <div className="queue-progress-bar-container">
          <div className="queue-progress-info">
            <span>
              Processing Item {currentIndex + 1} of {queue.length}
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
        {queue.map((item, index) => {
          const isCurrent = isProcessing && index === currentIndex;
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
              className={`queue-item-card ${isCurrent ? "current" : ""} status-${item.status}`}
              onClick={() => onSelectItem && onSelectItem(item)}
            >
              <div className="queue-item-header">
                <span className="queue-item-index">#{index + 1}</span>
                <span className={`status-pill ${item.status}`}>
                  {statusLabels[item.status] || item.status}
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
                  Reduction: {item.config.DEFAULT_REDUCTION_METHOD}
                </span>
                <span className="param-tag">
                  {item.config.USE_INCREMENTAL_SOLVER
                    ? "Incremental"
                    : "Monolithic"}
                </span>
                <span className="param-tag">
                  Dir: {item.config.OUTPUT_DIR || "output"}
                </span>
              </div>

              {item.result && (
                <div className="queue-item-result-snippet">
                  <span>
                    Status: <strong>{item.result.solver_status}</strong> &bull;{" "}
                    Time: {item.result.runtime_sec}s &bull; Iter:{" "}
                    {item.result.iterations}
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
                  title="Remove configuration from queue"
                  aria-label="Remove item"
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
