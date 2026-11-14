import type { QueueItem } from "../types";
import { scientificOutcomeLabel } from "../utils/execution";
import { groupQueue } from "../utils/experiments";
import { formatReductionMethod } from "../utils/formatters";
import { useI18n } from "../i18n";
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
  const { t, n } = useI18n();
  if (queue.length === 0) {
    return (
      <div className="queue-empty-card">
        <p className="queue-empty-text">
          {workflowMode === "create"
            ? t(
                "The configuration queue is empty. Configure the parameters above and add configurations to the batch.",
              )
            : t(
                "The execution queue is empty. Configure the parameters above and click + Add to Queue to enqueue batch configurations.",
              )}
        </p>
      </div>
    );
  }
  const groups = groupQueue(queue);
  const currentGroupIndex = groups.findIndex((group) =>
    group.includes(queue[currentIndex]),
  );
  const completedCount = queue.filter(
    (item) => item.status === "completed" || item.status === "failed",
  ).length;
  const progressPercent = Math.round((completedCount / queue.length) * 100);
  return (
    <div className="queue-panel-container">
      <div className="queue-panel-header">
        <div>
          <h3>
            {workflowMode === "create"
              ? t("Configuration Queue")
              : t("Batch Execution Queue")}{" "}
            ({n(groups.length)} {groups.length === 1 ? t("item") : t("items")})
          </h3>
          <p className="subtitle">
            {workflowMode === "create"
              ? t("Review each route, then save the configuration files.")
              : t("Sequential pipeline execution across parameterized runs.")}
          </p>
        </div>

        <div className="queue-header-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClearQueue}
            disabled={isProcessing}
          >
            {t("Clear Queue")}
          </button>

          <button
            type="button"
            className="btn btn-vibrant"
            onClick={onStartQueue}
            disabled={isProcessing || queue.length === 0}
          >
            {isProcessing
              ? workflowMode === "create"
                ? t("Preparing Routes ({current}/{total})...", {
                    current: n(currentGroupIndex + 1),
                    total: n(groups.length),
                  })
                : t("Running Queue ({current}/{total})...", {
                    current: n(currentGroupIndex + 1),
                    total: n(groups.length),
                  })
              : workflowMode === "create"
                ? t("Review Routes ({count} {kind})", {
                    count: n(groups.length),
                    kind: groups.length === 1 ? t("item") : t("items"),
                  })
                : t("Run Queue ({count} {kind})", {
                    count: n(groups.length),
                    kind: groups.length === 1 ? t("item") : t("items"),
                  })}
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
              {t("Interactive Verification:")}{" "}
              {interactiveMode
                ? t("Enabled (pause per run to inspect/modify route)")
                : t("Disabled (automatic execution)")}
            </span>
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="queue-progress-bar-container">
          <div className="queue-progress-info">
            <span>
              {t(
                "Processing Item {current} of {total} ({completed} of {runs} runs finished)",
                {
                  current: n(currentGroupIndex + 1),
                  total: n(groups.length),
                  completed: n(completedCount),
                  runs: n(queue.length),
                },
              )}
            </span>
            <span>
              {n(progressPercent)}% {t("Completed")}
            </span>
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
            pending: t("Pending"),
            generating_map: t("Generating map..."),
            awaiting_route: t("Awaiting route"),
            solving: t("Solving ISP..."),
            completed: t("Completed"),
            failed: t("Failed"),
          };
          return (
            <div
              key={item.id}
              className={`queue-item-card ${isCurrent ? "current" : ""} status-${status}`}
              onClick={() => onSelectItem && onSelectItem(item)}
            >
              <div className="queue-item-header">
                <span className="queue-item-index">#{n(index + 1)}</span>
                <span className={`status-pill ${status}`}>
                  {statusLabels[status] || status}
                </span>
              </div>

              <div className="queue-item-params">
                <span className="param-tag">
                  {n(item.config.MAP_H)}x{n(item.config.MAP_W)}
                </span>
                <span className="param-tag">
                  {n(item.config.CONNECTIVITY)}-{t("Connected")}
                </span>
                <span className="param-tag">
                  {t("Seed:")} #{n(item.config.MAP_DEFAULT_SEED)}
                </span>
                {isGroup ? (
                  <span className="param-tag">
                    {isBenchmark ? "Benchmark" : t("Scenario comparison")} ·{" "}
                    {n(group.length)}{" "}
                    {workflowMode === "create"
                      ? t("configurations")
                      : t("executions")}
                  </span>
                ) : (
                  <>
                    <span className="param-tag">
                      {t("Reduction:")}{" "}
                      {t(
                        formatReductionMethod(
                          item.config.DEFAULT_REDUCTION_METHOD,
                        ),
                      )}
                    </span>
                    <span className="param-tag">
                      {item.config.USE_INCREMENTAL_SOLVER
                        ? t("Incremental")
                        : t("Monolithic")}
                    </span>
                  </>
                )}
                {!isGroup && item.outputDir && (
                  <span className="param-tag">
                    {t("Dir:")} {item.outputDir}
                  </span>
                )}
              </div>

              {!isGroup && item.result && (
                <div className="queue-item-result-snippet">
                  <span>
                    {t("Result:")}{" "}
                    <strong>{t(scientificOutcomeLabel(item.result))}</strong>{" "}
                    &bull; {t("Time:")}{" "}
                    {item.result.runtime_sec == null
                      ? t("Unavailable")
                      : `${n(item.result.runtime_sec, 3)}s`}{" "}
                    &bull; {t("Iter:")}{" "}
                    {item.result.iterations == null
                      ? t("Unavailable")
                      : n(item.result.iterations)}
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
                      ? t("Remove every scenario in this group")
                      : t("Remove configuration from queue")
                  }
                  aria-label={
                    item.benchmarkGroup
                      ? t("Remove scenario group")
                      : t("Remove item")
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
