import { useEffect, useId, useState } from "react";

import { STUDY_GROUPS as GROUPS, GROUP_LABELS } from "../utils/studyGroups";
import type { StudyGroup } from "../utils/studyGroups";
import {
  ApiError,
  formatNumber as localizedNumber,
  presentError,
  requestedLanguage,
  translate,
} from "../i18n";

const t = (message: string, variables?: Record<string, string | number>) =>
  translate(requestedLanguage(), message, variables);
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

const LIKERT_LABELS = [
  "Strongly disagree",
  "Somewhat disagree",
  "Neither agree nor disagree",
  "Somewhat agree",
  "Strongly agree",
];

function formatNumber(value: number, decimals = 1) {
  return localizedNumber(requestedLanguage(), value, decimals);
}

function observationLabel(counts: ObservationCounts) {
  return t(
    "{responses} valid responses · {participants} participants · {missing} missing or invalid",
    {
      responses: formatNumber(counts.responses, 0),
      participants: formatNumber(counts.participants, 0),
      missing: formatNumber(counts.missing, 0),
    },
  );
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
        <strong>{t(GROUP_LABELS[group])}</strong>
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
          {item.source_scale} {formatNumber(item.source_item_number, 0)}
        </span>
        <h5>{t(item.prompt)}</h5>
        <p className="qa-muted">{t(item.topic)}</p>
      </figcaption>
      {GROUPS.map((group) => {
        const counts = item.groups[group];
        return (
          <div className="qa-results-group" key={group}>
            <div className="qa-results-group-heading">
              <strong>{t(GROUP_LABELS[group])}</strong>
              <span className="qa-muted">
                {t(
                  "{responses} valid responses · {missing} missing or invalid",
                  {
                    responses: formatNumber(counts.responses, 0),
                    missing: formatNumber(counts.missing, 0),
                  },
                )}
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
              <p className="qa-muted">
                {t("No valid responses for this item.")}
              </p>
            )}
            <dl
              className="qa-rating-counts"
              aria-label={t("{group} response distribution", {
                group: t(GROUP_LABELS[group]),
              })}
            >
              {counts.distribution.map((count, index) => (
                <div key={index}>
                  <dt>
                    <span
                      className={`qa-rating-swatch qa-rating-level-${index + 1}`}
                      aria-hidden="true"
                    />
                    {t("Rating {number}", {
                      number: formatNumber(index + 1, 0),
                    })}
                  </dt>
                  <dd>
                    {formatNumber(count, 0)}
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
          <h4>
            {t("Predictive accuracy / alignment with the system’s choice")}
          </h4>
          <p className="qa-muted">
            {t(
              "One measure: the proportion of valid predictions matching the optimal route across the three unseen scenarios. Predictive accuracy and alignment refer to this same proportion.",
            )}
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
                  ? t("No valid responses")
                  : `${formatNumber(values.proportion * 100)}% · ${formatNumber(values.correct, 0)} / ${formatNumber(values.responses, 0)}`
              }
              detail={observationLabel(values)}
            />
          );
        })}
        <p className="qa-results-axis">{t("Scale: 0–100%")}</p>
      </figure>
      <figure
        className="qa-results-chart"
        tabIndex={0}
        aria-labelledby={confidenceId}
      >
        <figcaption id={confidenceId}>
          <h4>{t("Mean prediction confidence")}</h4>
          <p className="qa-muted">
            {t(
              "Self-reported confidence in predicting the system’s choice, from 0 to 100.",
            )}
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
                  ? t("No valid responses")
                  : `${formatNumber(values.mean)} / 100`
              }
              detail={observationLabel(values)}
            />
          );
        })}
        <p className="qa-results-axis">{t("Scale: 0–100")}</p>
      </figure>
      <figure
        className="qa-results-chart"
        tabIndex={0}
        aria-labelledby={timeId}
      >
        <figcaption id={timeId}>
          <h4>{t("Median prediction decision time")}</h4>
          <p className="qa-muted">
            {t(
              "Foreground time from scenario presentation to Confirm route, excluding confidence, justification, hidden-tab intervals and time away.",
            )}
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
                  ? t("No valid responses")
                  : `${formatNumber(values.median_seconds, 3)} s`
              }
              detail={observationLabel(values)}
            />
          );
        })}
        <p className="qa-results-axis">
          {t("Shared scale: 0–")}
          {formatNumber(maximumTime, 3)} {t("seconds")}
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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
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
          throw new ApiError(
            typeof body?.detail === "string"
              ? body.detail
              : "Unable to load questionnaire results.",
            "Unable to load questionnaire results.",
          );
        return body as QuestionnaireResults;
      })
      .then((data) => {
        if (!controller.signal.aborted) setResults(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            presentError(
              requestedLanguage(),
              reason,
              "Unable to load questionnaire results.",
            ),
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

  async function downloadCsv() {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const response = await fetch(
        `/api/questionnaires/${questionnaireId}/responses.csv`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new ApiError(
          typeof data?.detail === "string"
            ? data.detail
            : "Unable to export responses.",
          "Unable to export responses.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `questionnaire-${questionnaireId}-responses.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setExportError(
        presentError(
          requestedLanguage(),
          reason,
          "Unable to export responses.",
        ),
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section
      className="qa-control-group qa-participation-summary qa-results-panel"
      aria-label={t("Participation and results")}
      aria-busy={loading}
    >
      <div className="qa-heading">
        <h3>{t("Participation")}</h3>
        <div className="qa-actions">
          <button
            type="button"
            className="qa-secondary qa-overview-action"
            disabled={exporting}
            onClick={() => void downloadCsv()}
          >
            {t(exporting ? "Exporting…" : "Export completed responses (CSV)")}
          </button>
          <button
            type="button"
            className="qa-secondary qa-overview-action"
            onClick={refresh}
            disabled={loading}
          >
            {t("Refresh results")}
          </button>
          <button
            type="button"
            className="qa-secondary qa-overview-action"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((current) => !current)}
          >
            {t(expanded ? "Hide results" : "View results")}
          </button>
        </div>
      </div>
      {exportError && (
        <p className="qa-error" role="alert">
          {exportError}
        </p>
      )}
      <dl className="qa-participation-counts">
        <div className="qa-completed-count">
          <dt>{t("Completed")}</dt>
          <dd>{summary ? formatNumber(summary.completed, 0) : "—"}</dd>
        </div>
        <div>
          <dt>{t("In progress")}</dt>
          <dd>{summary ? formatNumber(summary.in_progress, 0) : "—"}</dd>
        </div>
        <div>
          <dt>{t("Total started")}</dt>
          <dd>{summary ? formatNumber(summary.total, 0) : "—"}</dd>
        </div>
      </dl>
      {summary && (
        <p className="qa-results-cohort">
          {t("Completed by group:")}{" "}
          {GROUPS.map((group, index) => (
            <span key={group}>
              {index > 0 && " · "}
              <strong>
                {t(GROUP_LABELS[group])}{" "}
                {formatNumber(summary.completed_by_group[group], 0)}
              </strong>
            </span>
          ))}
        </p>
      )}
      {loading && (
        <p className="qa-muted" role="status">
          {t("Loading participation and results...")}
        </p>
      )}
      {error && (
        <div className="qa-error" role="alert">
          <p>
            {error}{" "}
            {results
              ? t("Showing the previous results. Refresh to try again.")
              : t("No results have been loaded.")}
          </p>
          <button
            type="button"
            className="qa-secondary"
            onClick={refresh}
            disabled={loading}
          >
            {t("Try again")}
          </button>
        </div>
      )}
      <div id={contentId} hidden={!expanded} className="qa-results-content">
        {results && (
          <>
            <div className="qa-results-heading">
              <h3>{t("Study results")}</h3>
              <p className="qa-muted">
                {t(
                  "Completed participations only. These descriptive comparisons do not establish statistical significance, objective comprehension or causal improvement. Sample sizes are shown for each measure.",
                )}
              </p>
            </div>
            {results.participation.completed === 0 ? (
              <p className="qa-results-empty">
                {t(
                  "No completed participations yet. In-progress responses are excluded from the analyses.",
                )}
              </p>
            ) : (
              <>
                <PredictionCharts predictions={results.predictions} />
                <p className="qa-muted">
                  {t(
                    "Confidence means and decision-time medians pool valid prediction responses, rather than participant averages. Each participant contributes up to three repeated observations. Decision time is not reading time or a measure of attention.",
                  )}
                </p>
                <section
                  className="qa-results-ratings"
                  aria-label={t("Adapted explanation questionnaire results")}
                >
                  <h4>{t("Adapted route explanation questionnaire")}</h4>
                  <p className="qa-muted">
                    {t(
                      "Distribution for each of the 14 selected ESS, SCS and xHIS items. Percentages use valid responses to that item in each group. The custom instrument has not been psychometrically validated; no overall score is calculated.",
                    )}
                  </p>
                  <ol
                    className="qa-rating-legend"
                    aria-label={t("Response scale")}
                  >
                    {LIKERT_LABELS.map((label, index) => (
                      <li key={label}>
                        <span
                          className={`qa-rating-swatch qa-rating-level-${index + 1}`}
                          aria-hidden="true"
                        />
                        <span>
                          <strong>{formatNumber(index + 1, 0)}</strong> ·{" "}
                          {t(label)}
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
