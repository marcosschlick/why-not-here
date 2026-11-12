import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  MapAppearance,
  MapData,
  SemanticModificationsData,
} from "../types";
import { ScenarioMapView } from "./ScenarioMapView";
import "./questionnaire-admin.css";

type Point = [number, number];
type Scenario = {
  map: Partial<MapData>;
  start: Point;
  goal: Point;
  terrain_colors: Record<string, string>;
  appearance: MapAppearance;
  routes: Point[][];
  route_order?: ("optimal" | "alternative")[];
  modifications?: SemanticModificationsData | null;
  show_explanation_map?: boolean;
};
type StudyStep = {
  index: number;
  type: "route_assessment" | "explanation" | "likert" | "route_prediction";
  question_id: number;
  prompt: string;
  scenario_number?: number;
  scenario?: Scenario;
  justification?: string;
  instrument?: string;
  source?: string;
  item_number?: number;
};
type Study = {
  title: string;
  description: string | null;
  submission_completed: boolean;
  current_step: number;
  total_steps: number;
  step: StudyStep | null;
};
type Preview = {
  questionnaireId: number;
  group: "control" | "experimental";
  submissionKey: string;
};
const LIKERT_LABELS = [
  "Strongly disagree",
  "Somewhat disagree",
  "Neither agree nor disagree",
  "Somewhat agree",
  "Strongly agree",
];

function attemptKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function scenarioMap(scenario: Scenario): MapData {
  return {
    ...scenario.map,
    start: scenario.start,
    goal: scenario.goal,
    terrain_colors: scenario.terrain_colors,
    appearance: scenario.appearance,
    auto_path: [],
    optimal_path: [],
    map_image_url: "",
    config: {},
  } as unknown as MapData;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : "Unable to load or save this step. Please try again.",
    );
  return body as T;
}

function RouteOptions({
  scenario,
  choice,
  onChange,
  disabled,
}: {
  scenario: Scenario;
  choice: number | null;
  onChange: (choice: number) => void;
  disabled: boolean;
}) {
  const map = useMemo(() => scenarioMap(scenario), [scenario]);
  return (
    <div className="qa-route-options">
      {scenario.routes.map((path, index) => (
        <div className="qa-route-option" key={index}>
          <label className="qa-option">
            <input
              type="radio"
              name="route-choice"
              checked={choice === index}
              onChange={() => onChange(index)}
              disabled={disabled}
              required
            />
            Route {index === 0 ? "A" : "B"}
          </label>
          <ScenarioMapView
            mapData={map}
            userPath={path}
            alternativePathLabel="Route"
          />
        </div>
      ))}
    </div>
  );
}

export function Participant({
  token = "",
  preview,
}: {
  token?: string;
  preview?: Preview;
}) {
  const [submissionKey] = useState(() => {
    if (preview) return preview.submissionKey;
    const key = `participation:${token}`;
    const saved = sessionStorage.getItem(key) || attemptKey();
    sessionStorage.setItem(key, saved);
    return saved;
  });
  const [study, setStudy] = useState<Study | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [confidence, setConfidence] = useState("");
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);
  const timer = useRef<number | null>(null);
  const step = study?.step;
  const timingKey = `participation-timing:${token}:${submissionKey}:${study?.current_step ?? 0}`;
  const previewId = preview?.questionnaireId;
  const previewGroup = preview?.group;
  const load = useCallback(
    async (index = 0) => {
      const path =
        previewId != null
          ? `/api/questionnaires/${previewId}/preview?group=${previewGroup}&step=${index}&submission_key=${submissionKey}`
          : `/api/participate/${encodeURIComponent(token)}?submission_key=${submissionKey}`;
      const response = await fetch(path, { cache: "no-store" });
      return readResponse<Study>(response);
    },
    [previewId, previewGroup, submissionKey, token],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setStudy(data);
      })
      .catch((failure: Error) => {
        if (!cancelled) setError(failure.message);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const stopTiming = useCallback(() => {
    if (timer.current !== null) {
      elapsed.current += performance.now() - timer.current;
      timer.current = null;
      if (previewId == null)
        sessionStorage.setItem(timingKey, String(elapsed.current));
    }
  }, [previewId, timingKey]);

  useEffect(() => {
    const stored = Number(sessionStorage.getItem(timingKey) || 0);
    elapsed.current =
      previewId == null && Number.isFinite(stored) && stored >= 0 ? stored : 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [timingKey, previewId, step?.index]);

  useEffect(() => {
    if (!step || busy || closed || study?.submission_completed) return;
    const start = () => {
      if (document.visibilityState === "visible" && timer.current === null)
        timer.current = performance.now();
    };
    const visibility = () => {
      if (document.visibilityState === "visible") start();
      else stopTiming();
    };
    const checkpoint = () => {
      stopTiming();
      start();
    };
    start();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", stopTiming);
    const interval = window.setInterval(checkpoint, 1000);
    return () => {
      stopTiming();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", stopTiming);
      window.clearInterval(interval);
    };
  }, [step, busy, closed, study?.submission_completed, stopTiming]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function accept(data: Study) {
    setStudy(data);
    setChoice(null);
    setConfidence("");
    setReason("");
    setRating(null);
    setAttempted(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!study || busy) return;
    setAttempted(true);
    setError("");
    let value: unknown = null;
    if (step?.type === "route_assessment") {
      const number = Number(confidence);
      if (
        choice === null ||
        confidence.trim() === "" ||
        !Number.isFinite(number) ||
        number < 0 ||
        number > 100 ||
        !reason.trim() ||
        reason.trim().length > 1000
      ) {
        setError(
          "Choose a route, enter confidence from 0 to 100, and explain your choice.",
        );
        return;
      }
      value = { choice, confidence: number, reason: reason.trim() };
    } else if (step?.type === "route_prediction") {
      if (choice === null) {
        setError("Choose a route before continuing.");
        return;
      }
      value = choice;
    } else if (step?.type === "likert") {
      if (rating === null) {
        setError("Select a rating before continuing.");
        return;
      }
      value = rating;
    }
    stopTiming();
    setBusy(true);
    try {
      if (!step) {
        if (!preview) {
          const response = await fetch(
            `/api/participate/${encodeURIComponent(token)}/submit`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ submission_key: submissionKey }),
            },
          );
          if (response.status === 410) setClosed(true);
          await readResponse(response);
        }
        setStudy({ ...study, submission_completed: true });
      } else {
        if (preview) accept(await load(step.index + 1));
        else {
          const response = await fetch(
            `/api/participate/${encodeURIComponent(token)}/steps/${step.index}/confirm`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                submission_key: submissionKey,
                value,
                visible_duration_ms: Math.round(elapsed.current),
              }),
            },
          );
          if (response.status === 410) setClosed(true);
          const next = await readResponse<Study>(response);
          sessionStorage.removeItem(timingKey);
          accept(next);
        }
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to save this step.",
      );
    } finally {
      setBusy(false);
    }
  }

  const phaseLabel = !step
    ? "Ready to submit"
    : step.type === "likert"
      ? `Explanation satisfaction ${step.item_number} of 8`
      : step.type === "route_prediction"
        ? `Prediction ${step.scenario_number} of 3`
        : `${step.type === "explanation" ? "Explanation" : "Route selection"} ${step.scenario_number} of 3`;
  const invalidConfidence =
    attempted &&
    (confidence.trim() === "" ||
      !Number.isFinite(Number(confidence)) ||
      Number(confidence) < 0 ||
      Number(confidence) > 100);
  const invalidReason =
    attempted && (!reason.trim() || reason.trim().length > 1000);
  return (
    <div className={`qa-app ${preview ? "qa-preview-app" : ""}`}>
      {!preview && (
        <header className="qa-header">
          <div>
            <h1>Route planning study</h1>
          </div>
        </header>
      )}
      <main className="qa-content qa-participant">
        {error && (
          <div role="alert" className="qa-error" tabIndex={-1} ref={errorRef}>
            {error}
          </div>
        )}
        {closed ? (
          <section className="qa-panel">
            <h2>Questionnaire closed</h2>
            <p>This questionnaire is no longer accepting answers.</p>
          </section>
        ) : study?.submission_completed ? (
          <section className="qa-panel">
            <h2>Thank you for participating</h2>
            <p>
              {preview
                ? "Preview complete. No answers were saved."
                : "Your answers have been submitted."}
            </p>
            {preview && (
              <button
                onClick={() => {
                  setError("");
                  void load()
                    .then(accept)
                    .catch((failure: Error) => setError(failure.message));
                }}
              >
                Restart preview
              </button>
            )}
          </section>
        ) : !study ? (
          <section className="qa-panel" aria-busy={!error}>
            <p role="status">
              {error
                ? "The questionnaire could not be loaded."
                : "Loading questionnaire..."}
            </p>
            <button
              type="button"
              onClick={() => {
                setError("");
                void load()
                  .then(accept)
                  .catch((failure: Error) => setError(failure.message));
              }}
            >
              Reload questionnaire
            </button>
          </section>
        ) : (
          <>
            <section className="qa-panel">
              <h2>{study.title}</h2>
              {study.description && <p>{study.description}</p>}
              <p className="qa-muted">
                Confirmed answers are saved automatically. You can reload to
                resume, but cannot return to previous steps.
              </p>
            </section>
            <form
              onSubmit={(event) => void confirm(event)}
              className="qa-participant-form"
              noValidate
            >
              <section className="qa-panel" aria-busy={busy}>
                <p className="qa-muted">{phaseLabel}</p>
                <h2 ref={headingRef} tabIndex={-1}>
                  {step?.prompt || "Submit your completed questionnaire"}
                </h2>
                {step?.type === "likert" && (
                  <>
                    <p>{step.instrument}</p>
                    <p className="qa-muted">
                      Rate the explanations received in the first three
                      scenarios. {step.source}.
                    </p>
                  </>
                )}
                <fieldset disabled={busy} className="qa-fieldset">
                  <legend className="qa-visually-hidden">{phaseLabel}</legend>
                  {attempted &&
                    choice === null &&
                    (step?.type === "route_assessment" ||
                      step?.type === "route_prediction") && (
                      <p className="qa-field-error">Choose route A or B.</p>
                    )}
                  {(step?.type === "route_assessment" ||
                    step?.type === "route_prediction") &&
                    step.scenario && (
                      <RouteOptions
                        scenario={step.scenario}
                        choice={choice}
                        onChange={setChoice}
                        disabled={busy}
                      />
                    )}
                  {step?.type === "route_assessment" && (
                    <div className="qa-form qa-assessment-fields">
                      <label htmlFor="confidence">
                        Confidence in your choice (0 to 100)
                        <input
                          id="confidence"
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          required
                          value={confidence}
                          onChange={(event) =>
                            setConfidence(event.target.value)
                          }
                          aria-invalid={invalidConfidence}
                          aria-describedby={
                            invalidConfidence
                              ? "confidence-help confidence-error"
                              : "confidence-help"
                          }
                        />
                      </label>
                      <p id="confidence-help" className="qa-muted">
                        0 means no confidence; 100 means complete confidence.
                      </p>
                      {invalidConfidence && (
                        <p id="confidence-error" className="qa-field-error">
                          Enter a number from 0 to 100.
                        </p>
                      )}
                      <label htmlFor="reason">
                        Why did you choose this route?
                        <textarea
                          id="reason"
                          rows={4}
                          required
                          maxLength={1000}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          aria-invalid={invalidReason}
                          aria-describedby={
                            invalidReason
                              ? "reason-count reason-error"
                              : "reason-count"
                          }
                        />
                      </label>
                      {invalidReason && (
                        <p id="reason-error" className="qa-field-error">
                          Explain your choice in 1 to 1000 characters.
                        </p>
                      )}
                      <span id="reason-count" className="qa-text-counter">
                        {reason.length} / 1000
                      </span>
                    </div>
                  )}
                  {step?.type === "likert" && (
                    <div className="qa-likert-group">
                      {attempted && rating === null && (
                        <p className="qa-field-error">Select one rating.</p>
                      )}
                      {LIKERT_LABELS.map((label, index) => (
                        <label className="qa-option" key={label}>
                          <input
                            type="radio"
                            name="ess-rating"
                            checked={rating === index + 1}
                            onChange={() => setRating(index + 1)}
                            required
                          />
                          {index + 1}. {label}
                        </label>
                      ))}
                    </div>
                  )}
                  {step?.type === "explanation" && step.scenario && (
                    <div className="qa-justification">
                      <p>{step.justification}</p>
                      <p>
                        Route{" "}
                        {step.scenario.route_order?.indexOf("optimal") === 0
                          ? "A"
                          : "B"}{" "}
                        is the system’s optimal route; route{" "}
                        {step.scenario.route_order?.indexOf("alternative") === 0
                          ? "A"
                          : "B"}{" "}
                        is the alternative.
                      </p>
                      {step.scenario.show_explanation_map &&
                        step.scenario.route_order && (
                          <ScenarioMapView
                            mapData={scenarioMap(step.scenario)}
                            optimalPath={
                              step.scenario.routes[
                                step.scenario.route_order.indexOf("optimal")
                              ]
                            }
                            userPath={
                              step.scenario.routes[
                                step.scenario.route_order.indexOf("alternative")
                              ]
                            }
                            modifications={step.scenario.modifications}
                          />
                        )}
                    </div>
                  )}
                  {!step && (
                    <p>
                      All required responses have been recorded. Submit to
                      complete your participation.
                    </p>
                  )}
                  <button type="submit" disabled={busy}>
                    {busy
                      ? "Saving..."
                      : !step
                        ? "Submit answers"
                        : step.type === "route_assessment"
                          ? "Confirm and reveal explanation"
                          : "Continue"}
                  </button>
                </fieldset>
              </section>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
