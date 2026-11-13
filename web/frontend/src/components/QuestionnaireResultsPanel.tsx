import { useEffect, useId, useState } from "react";

type StudyGroup = "control" | "experimental";
type GroupValues<T> = Record<StudyGroup, T>;
type ObservationCounts = {
  responses: number;
  participants: number;
  missing: number;
};
type PredictionResults = ObservationCounts & {
  correct: number;
  proportion: number | null;
  confidence: ObservationCounts & { mean: number | null };
  decision_time: ObservationCounts & { median_seconds: number | null };
};
type RatingItem = {
  item_id: string;
  prompt: string;
  source_scale: string;
  source_item_number: number;
  topic: string;
  groups: GroupValues<{
    distribution: number[];
    responses: number;
    missing: number;
  }>;
};
type QuestionnaireResults = {
  participation: {
    total: number;
    completed: number;
    in_progress: number;
    completed_by_group: GroupValues<number>;
  };
  rating_items: RatingItem[];
  predictions: GroupValues<PredictionResults>;
};

const GROUPS: StudyGroup[] = ["control", "experimental"];
const GROUP_LABELS: GroupValues<string> = {
  control: "Control",
  experimental: "Experimental",
};
const LIKERT_LABELS = [
  "Strongly disagree",
  "Somewhat disagree",
  "Neither agree nor disagree",
  "Somewhat agree",
  "Strongly agree",
];

function formatNumber(value: number, decimals = 1) {
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function observationLabel(counts: ObservationCounts) {
  return `${counts.responses} valid responses · ${counts.participants} participants · ${counts.missing} missing or invalid`;
}

function GroupBar({
  group,
  value,
  maximum,
  label,
  detail,
}: {
  group: StudyGroup;
  value: number | null;
  maximum: number;
  label: string;
  detail: string;
}) {
  return (
    <div className="qa-results-group">
      <div className="qa-results-group-heading">
        <strong>{GROUP_LABELS[group]}</strong>
        <span className="qa-results-value">{label}</span>
      </div>
      {value !== null && (
        <div className="qa-results-track" aria-hidden="true">
          <span
            className={`qa-results-fill qa-results-fill-${group}`}
            style={{ width: `${(value / maximum) * 100}%` }}
          />
        </div>
      )}
      <p className="qa-muted">{detail}</p>
    </div>
  );
}

function RatingDistribution({ item }: { item: RatingItem }) {
  const headingId = useId();
  return (
    <figure className="qa-rating-item" tabIndex={0} aria-labelledby={headingId}>
      <figcaption id={headingId}>
        <span className="qa-overline">
          {item.source_scale} {item.source_item_number}
        </span>
        <h5>{item.prompt}</h5>
        <p className="qa-muted">{item.topic}</p>
      </figcaption>
      {GROUPS.map((group) => {
        const counts = item.groups[group];
        return (
          <div className="qa-results-group" key={group}>
            <div className="qa-results-group-heading">
              <strong>{GROUP_LABELS[group]}</strong>
              <span className="qa-muted">
                {counts.responses} valid responses · {counts.missing} missing or
                invalid
              </span>
            </div>
            {counts.responses > 0 ? (
              <div className="qa-rating-track" aria-hidden="true">
                {counts.distribution.map((count, index) => (
                  <span
                    key={index}
                    className={`qa-rating-level qa-rating-level-${index + 1}`}
                    style={{ width: `${(count / counts.responses) * 100}%` }}
                  />
                ))}
              </div>
            ) : (
              <p className="qa-muted">No valid responses for this item.</p>
            )}
            <dl
              className="qa-rating-counts"
              aria-label={`${GROUP_LABELS[group]} response distribution`}
            >
              {counts.distribution.map((count, index) => (
                <div key={index}>
                  <dt>
                    <span
                      className={`qa-rating-swatch qa-rating-level-${index + 1}`}
                      aria-hidden="true"
                    />
                    Rating {index + 1}
                  </dt>
                  <dd>
                    {count}
                    {counts.responses > 0 && (
                      <span>
                        {" "}
                        ({formatNumber((count / counts.responses) * 100)}%)
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </figure>
  );
}

function PredictionCharts({
  predictions,
}: {
  predictions: GroupValues<PredictionResults>;
}) {
  const accuracyId = useId();
  const confidenceId = useId();
  const timeId = useId();
  const maximumTime = Math.max(
    1,
    ...GROUPS.map(
      (group) => predictions[group].decision_time.median_seconds ?? 0,
    ),
  );
  return (
    <div className="qa-results-comparisons">
      <figure
        className="qa-results-chart"
        tabIndex={0}
        aria-labelledby={accuracyId}
      >
        <figcaption id={accuracyId}>
          <h4>Predictions matching the optimal route</h4>
          <p className="qa-muted">
            Proportion of valid choices matching the optimal route across the
            three unseen scenarios.
          </p>
        </figcaption>
        {GROUPS.map((group) => {
          const values = predictions[group];
          return (
            <GroupBar
              key={group}
              group={group}
              value={values.proportion}
              maximum={1}
              label={
                values.proportion === null
                  ? "No valid responses"
                  : `${formatNumber(values.proportion * 100)}% · ${values.correct} / ${values.responses}`
              }
              detail={observationLabel(values)}
            />
          );
        })}
        <p className="qa-results-axis">Scale: 0–100%</p>
      </figure>
      <figure
        className="qa-results-chart"
        tabIndex={0}
        aria-labelledby={confidenceId}
      >
        <figcaption id={confidenceId}>
          <h4>Mean prediction confidence</h4>
          <p className="qa-muted">
            Self-reported confidence in predicting the system’s choice, from 0
            to 100.
          </p>
        </figcaption>
        {GROUPS.map((group) => {
          const values = predictions[group].confidence;
          return (
            <GroupBar
              key={group}
              group={group}
              value={values.mean}
              maximum={100}
              label={
                values.mean === null
                  ? "No valid responses"
                  : `${formatNumber(values.mean)} / 100`
              }
              detail={observationLabel(values)}
            />
          );
        })}
        <p className="qa-results-axis">Scale: 0–100</p>
      </figure>
      <figure
        className="qa-results-chart"
        tabIndex={0}
        aria-labelledby={timeId}
      >
        <figcaption id={timeId}>
          <h4>Median prediction decision time</h4>
          <p className="qa-muted">
            Foreground time from scenario presentation to Confirm route,
            excluding confidence, justification, hidden-tab intervals and time
            away.
          </p>
        </figcaption>
        {GROUPS.map((group) => {
          const values = predictions[group].decision_time;
          return (
            <GroupBar
              key={group}
              group={group}
              value={values.median_seconds}
              maximum={maximumTime}
              label={
                values.median_seconds === null
                  ? "No valid responses"
                  : `${formatNumber(values.median_seconds, 3)} s`
              }
              detail={observationLabel(values)}
            />
          );
        })}
        <p className="qa-results-axis">
          Shared scale: 0–{formatNumber(maximumTime, 3)} seconds
        </p>
      </figure>
    </div>
  );
}

export function QuestionnaireResultsPanel({
  questionnaireId,
}: {
  questionnaireId: number;
}) {
  const [results, setResults] = useState<QuestionnaireResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const summary = results?.participation;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/questionnaires/${questionnaireId}/results`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || body === null)
          throw new Error(
            typeof body?.detail === "string"
              ? body.detail
              : "Unable to load questionnaire results.",
          );
        return body as QuestionnaireResults;
      })
      .then((data) => {
        if (!controller.signal.aborted) setResults(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load questionnaire results.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [questionnaireId, refreshVersion]);

  function refresh() {
    setLoading(true);
    setError("");
    setRefreshVersion((current) => current + 1);
  }

  return (
    <section
      className="qa-control-group qa-participation-summary qa-results-panel"
      aria-label="Participation and results"
      aria-busy={loading}
    >
      <div className="qa-heading">
        <h3>Participation</h3>
        <div className="qa-actions">
          <button
            type="button"
            className="qa-secondary qa-overview-action"
            onClick={refresh}
            disabled={loading}
          >
            Refresh results
          </button>
          <button
            type="button"
            className="qa-secondary qa-overview-action"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Hide results" : "View results"}
          </button>
        </div>
      </div>
      <dl className="qa-participation-counts">
        <div className="qa-completed-count">
          <dt>Completed</dt>
          <dd>{summary?.completed ?? "—"}</dd>
        </div>
        <div>
          <dt>In progress</dt>
          <dd>{summary?.in_progress ?? "—"}</dd>
        </div>
        <div>
          <dt>Total started</dt>
          <dd>{summary?.total ?? "—"}</dd>
        </div>
      </dl>
      {summary && (
        <p className="qa-results-cohort">
          Completed by group:{" "}
          <strong>Control {summary.completed_by_group.control}</strong> ·{" "}
          <strong>
            Experimental {summary.completed_by_group.experimental}
          </strong>
        </p>
      )}
      {loading && (
        <p className="qa-muted" role="status">
          Loading participation and results...
        </p>
      )}
      {error && (
        <div className="qa-error" role="alert">
          <p>
            {error}{" "}
            {results
              ? "Showing the previous results. Refresh to try again."
              : "No results have been loaded."}
          </p>
          <button
            type="button"
            className="qa-secondary"
            onClick={refresh}
            disabled={loading}
          >
            Try again
          </button>
        </div>
      )}
      <div id={contentId} hidden={!expanded} className="qa-results-content">
        {results && (
          <>
            <div className="qa-results-heading">
              <h3>Study results</h3>
              <p className="qa-muted">
                Completed participations only. These descriptive comparisons do
                not establish statistical significance, objective comprehension
                or causal improvement. Sample sizes are shown for each measure.
              </p>
            </div>
            {results.participation.completed === 0 ? (
              <p className="qa-results-empty">
                No completed participations yet. In-progress responses are
                excluded from the analyses.
              </p>
            ) : (
              <>
                <PredictionCharts predictions={results.predictions} />
                <p className="qa-muted">
                  Confidence means and decision-time medians pool valid
                  prediction responses, rather than participant averages. Each
                  participant contributes up to three repeated observations.
                  Decision time is not reading time or a measure of attention.
                </p>
                <section
                  className="qa-results-ratings"
                  aria-label="Adapted explanation questionnaire results"
                >
                  <h4>Adapted route explanation questionnaire</h4>
                  <p className="qa-muted">
                    Distribution for each of the 14 selected ESS, SCS and xHIS
                    items. Percentages use valid responses to that item in each
                    group. The custom instrument has not been psychometrically
                    validated; no overall score is calculated.
                  </p>
                  <ol className="qa-rating-legend" aria-label="Response scale">
                    {LIKERT_LABELS.map((label, index) => (
                      <li key={label}>
                        <span
                          className={`qa-rating-swatch qa-rating-level-${index + 1}`}
                          aria-hidden="true"
                        />
                        <span>
                          <strong>{index + 1}</strong> · {label}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="qa-rating-items">
                    {results.rating_items.map((item) => (
                      <RatingDistribution key={item.item_id} item={item} />
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
