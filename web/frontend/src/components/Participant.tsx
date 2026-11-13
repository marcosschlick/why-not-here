import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  MapAppearance,
  MapData,
  SemanticModificationsData,
} from "../types";
import {
  emptyProgress,
  readResponse,
  RequestError,
  useParticipationProgress,
} from "../utils/useParticipationProgress";
import type {
  RouteFields,
  StepProgress,
} from "../utils/useParticipationProgress";
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
  response_prompt?: string;
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
  draft: StepProgress | null;
  draft_revision: number;
};
type Preview = {
  questionnaireId: number;
  group: "control" | "experimental";
  submissionKey: string;
};
type Session = { id: string; started: boolean; token?: string };
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

function RouteOptions({
  scenario,
  choice,
  onChange,
  disabled,
  onReady,
}: {
  scenario: Scenario;
  choice: number | null;
  onChange: (choice: number) => void;
  disabled: boolean;
  onReady: () => void;
}) {
  const map = useMemo(() => scenarioMap(scenario), [scenario]);
  const root = useRef<HTMLDivElement>(null);
  const rendered = useRef(new Set<number>());
  const visible = useRef(false);
  const checkReady = useCallback(() => {
    if (visible.current && rendered.current.size === scenario.routes.length)
      onReady();
  }, [onReady, scenario.routes.length]);
  const firstRendered = useCallback(() => {
    rendered.current.add(0);
    checkReady();
  }, [checkReady]);
  const secondRendered = useCallback(() => {
    rendered.current.add(1);
    checkReady();
  }, [checkReady]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      checkReady();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [checkReady]);
  return (
    <div className="qa-route-options" ref={root}>
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
            onRendered={index === 0 ? firstRendered : secondRendered}
          />
        </div>
      ))}
    </div>
  );
}

function ConfidenceField({
  value,
  onChange,
  attempted,
  prediction,
}: {
  value: number | null;
  onChange: (value: number) => void;
  attempted: boolean;
  prediction: boolean;
}) {
  const invalid = attempted && value === null;
  return (
    <div className="qa-assessment-field">
      <label htmlFor="confidence">
        {prediction
          ? "Confidence in your prediction of the system’s choice (0 to 100)"
          : "Confidence in your choice (0 to 100)"}
        <span className="qa-confidence-value">
          {value === null ? "Not selected" : value}
        </span>
        <input
          id="confidence"
          className="qa-confidence-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          value={value ?? 50}
          onChange={(event) => onChange(Number(event.target.value))}
          onPointerUp={(event) => onChange(Number(event.currentTarget.value))}
          onKeyUp={(event) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ].includes(event.key)
            )
              onChange(Number(event.currentTarget.value));
          }}
          aria-invalid={invalid}
          aria-required="true"
          aria-valuetext={value === null ? "Not selected" : undefined}
          aria-describedby={
            invalid ? "confidence-help confidence-error" : "confidence-help"
          }
        />
      </label>
      <p id="confidence-help" className="qa-muted">
        0 means no confidence; 100 means complete confidence.
      </p>
      {invalid && (
        <p id="confidence-error" className="qa-field-error">
          Select your confidence level.
        </p>
      )}
    </div>
  );
}

function ReasonField({
  prompt,
  value,
  onChange,
  attempted,
}: {
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  attempted: boolean;
}) {
  const length = Array.from(value.trim()).length;
  const invalid = attempted && (length < 20 || length > 1000);
  return (
    <div className="qa-assessment-field">
      <label htmlFor="reason">
        {prompt}
        <textarea
          id="reason"
          rows={4}
          required
          value={value}
          onChange={(event) =>
            onChange(Array.from(event.target.value).slice(0, 1000).join(""))
          }
          aria-invalid={invalid}
          aria-describedby={
            invalid ? "reason-count reason-error" : "reason-count"
          }
        />
      </label>
      {invalid && (
        <p id="reason-error" className="qa-field-error">
          Enter 20 to 1000 characters.
        </p>
      )}
      <span id="reason-count" className="qa-text-counter">
        {length} / 1000 characters (minimum 20)
      </span>
    </div>
  );
}

function StudyForm({
  study,
  token,
  submissionKey,
  preview,
  load,
  accept,
}: {
  study: Study;
  token: string;
  submissionKey: string;
  preview: boolean;
  load: (index?: number) => Promise<Study>;
  accept: (study: Study) => void;
}) {
  const step = study.step;
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const progress = useParticipationProgress({
    initial: study.draft ?? emptyProgress(step?.type ?? "likert"),
    initialRevision: study.draft_revision,
    token,
    submissionKey,
    stepIndex: study.current_step,
    preview: preview || !step,
  });
  const { markReady } = progress;
  const route =
    step?.type === "route_assessment" || step?.type === "route_prediction";
  const fields = (
    typeof progress.progress.value === "object" &&
    progress.progress.value !== null
      ? progress.progress.value
      : {}
  ) as RouteFields;
  const choice = fields.choice ?? null;
  const confidence = fields.confidence ?? null;
  const reason = fields.reason ?? "";
  const rating =
    typeof progress.progress.value === "number"
      ? progress.progress.value
      : null;
  const routeConfirmed = progress.progress.route_confirmed;
  const phaseLabel = !step
    ? "Ready to submit"
    : step.type === "likert"
      ? `Explanation satisfaction ${step.item_number} of 8`
      : step.type === "route_prediction"
        ? `Prediction ${step.scenario_number} of 3`
        : `${step.type === "explanation" ? "Explanation" : "Route selection"} ${step.scenario_number} of 3`;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (
      !route &&
      !(step?.type === "explanation" && step.scenario?.show_explanation_map)
    ) {
      const frame = requestAnimationFrame(markReady);
      return () => cancelAnimationFrame(frame);
    }
  }, [markReady, route, step]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function editFields(patch: Partial<RouteFields>) {
    progress.update({
      value: { ...(progress.snapshot().value as RouteFields), ...patch },
    });
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || progress.conflict) return;
    setError("");
    if (route && !routeConfirmed) {
      if (choice === null) {
        setAttempted(true);
        return;
      }
      progress.pause();
      progress.update({
        route_confirmed: true,
        decision_visible_duration_ms: progress.snapshot().visible_duration_ms,
      });
      setBusy(true);
      try {
        await progress.flush();
        setAttempted(false);
        fieldsRef.current?.focus();
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to confirm your route.",
        );
      } finally {
        setBusy(false);
        progress.resume();
      }
      return;
    }
    setAttempted(true);
    const reasonLength = Array.from(reason.trim()).length;
    if (
      (route && confidence === null) ||
      ((step?.type === "route_assessment" || step?.type === "explanation") &&
        (reasonLength < 20 || reasonLength > 1000)) ||
      (step?.type === "likert" && rating === null)
    )
      return;
    progress.pause();
    setBusy(true);
    try {
      if (!step) {
        if (!preview)
          await readResponse(
            await fetch(
              `/api/participate/${encodeURIComponent(token)}/submit`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ submission_key: submissionKey }),
              },
            ),
          );
        accept({ ...study, submission_completed: true });
      } else if (preview) {
        accept(await load(step.index + 1));
      } else {
        await progress.flush();
        const next = await readResponse<Study>(
          await fetch(
            `/api/participate/${encodeURIComponent(token)}/steps/${step.index}/confirm`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                submission_key: submissionKey,
                revision: progress.revision.current,
                progress: progress.snapshot(),
              }),
            },
          ),
        );
        progress.clear();
        accept(next);
      }
    } catch (failure) {
      if (failure instanceof RequestError && failure.status === 410)
        setClosed(true);
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to save this step.",
      );
    } finally {
      setBusy(false);
      progress.resume();
    }
  }

  async function reload() {
    progress.pause();
    setBusy(true);
    try {
      accept(await load(study.current_step));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to reload this questionnaire.",
      );
    } finally {
      setBusy(false);
      progress.resume();
    }
  }

  if (closed)
    return (
      <section className="qa-panel">
        <h2>Questionnaire closed</h2>
        <p>This questionnaire is no longer accepting answers.</p>
      </section>
    );
  return (
    <>
      <section className="qa-panel">
        <h2>{study.title}</h2>
        {study.description && <p>{study.description}</p>}
        <p className="qa-muted">
          Progress is saved as you work. To resume later, return to this address
          and enter the same name, email and individual key. Confirmed steps
          cannot be revisited.
        </p>
      </section>
      {error && (
        <div role="alert" className="qa-error" tabIndex={-1} ref={errorRef}>
          {error}
          <button
            type="button"
            className="qa-secondary"
            disabled={busy}
            onClick={() => void reload()}
          >
            Reload saved progress
          </button>
        </div>
      )}
      {step && !preview && (
        <div className="qa-progress-status" role="status">
          {progress.saveError ? (
            <>
              <span>{progress.saveError}</span>
              <button
                type="button"
                className="qa-secondary"
                disabled={busy}
                onClick={() => {
                  if (progress.conflict) void reload();
                  else void progress.flush().catch(() => undefined);
                }}
              >
                {progress.conflict ? "Reload saved progress" : "Retry saving"}
              </button>
            </>
          ) : progress.saved ? (
            "Progress saved."
          ) : (
            "Saving progress..."
          )}
        </div>
      )}
      <form
        onSubmit={(event) => void confirm(event)}
        className="qa-participant-form"
        noValidate
      >
        <section className="qa-panel" aria-busy={busy}>
          <p className="qa-muted">{phaseLabel}</p>
          <h2 ref={heading} tabIndex={-1}>
            {step?.prompt || "Submit your completed questionnaire"}
          </h2>
          {step?.type === "likert" && (
            <>
              <p>{step.instrument}</p>
              <p className="qa-muted">
                Rate the explanations received in the first three scenarios.{" "}
                {step.source}.
              </p>
            </>
          )}
          <fieldset
            disabled={busy || progress.conflict}
            className="qa-fieldset"
          >
            <legend className="qa-visually-hidden">{phaseLabel}</legend>
            {route && step?.scenario && (
              <>
                <p className="qa-muted">
                  {routeConfirmed
                    ? "Your route is confirmed. Complete the fields below to continue."
                    : "Choose route A or B. You may change your choice until you confirm it."}
                </p>
                {attempted && choice === null && (
                  <p className="qa-field-error">Choose route A or B.</p>
                )}
                <RouteOptions
                  scenario={step.scenario}
                  choice={choice}
                  onChange={progress.choose}
                  disabled={busy || routeConfirmed || !progress.isReady}
                  onReady={markReady}
                />
                {routeConfirmed && (
                  <div
                    className="qa-form qa-assessment-fields"
                    ref={fieldsRef}
                    tabIndex={-1}
                  >
                    <ConfidenceField
                      value={confidence}
                      onChange={(value) => editFields({ confidence: value })}
                      attempted={attempted}
                      prediction={step.type === "route_prediction"}
                    />
                    {step.type === "route_assessment" && (
                      <ReasonField
                        prompt="Why did you choose this route?"
                        value={reason}
                        onChange={(value) => editFields({ reason: value })}
                        attempted={attempted}
                      />
                    )}
                  </div>
                )}
              </>
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
                      onChange={() => progress.update({ value: index + 1 })}
                      required
                    />
                    {index + 1}. {label}
                  </label>
                ))}
              </div>
            )}
            {step?.type === "explanation" && step.scenario && (
              <>
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
                        onRendered={markReady}
                      />
                    )}
                </div>
                <div className="qa-form qa-assessment-fields">
                  <ReasonField
                    prompt={
                      step.response_prompt ??
                      "After reading the explanation, which characteristics explain the system’s route choice?"
                    }
                    value={reason}
                    onChange={(value) => editFields({ reason: value })}
                    attempted={attempted}
                  />
                </div>
              </>
            )}
            {!step && (
              <p>
                All required responses have been recorded. Submit to complete
                your participation.
              </p>
            )}
            <button
              type="submit"
              disabled={busy || (!!step && !progress.isReady)}
            >
              {busy
                ? "Saving..."
                : !step
                  ? "Submit answers"
                  : route && !routeConfirmed
                    ? "Confirm route"
                    : step.type === "route_assessment"
                      ? "Confirm and reveal explanation"
                      : "Continue"}
            </button>
          </fieldset>
        </section>
      </form>
    </>
  );
}

export function Participant({ preview }: { preview?: Preview }) {
  const [session, setSession] = useState<Session | null>(() => {
    if (preview) return null;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("questionnaire-session") || "null",
      );
      return saved &&
        typeof saved.id === "string" &&
        typeof saved.started === "boolean" &&
        (!saved.started || typeof saved.token === "string")
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  const token = session?.token ?? "";
  const submissionKey = preview?.submissionKey ?? session?.id ?? "";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [individualKey, setIndividualKey] = useState("");
  const [study, setStudy] = useState<Study | null>(null);
  const [generation, setGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const previewId = preview?.questionnaireId;
  const previewGroup = preview?.group;
  const load = useCallback(
    async (index = 0) => {
      const path =
        previewId != null
          ? `/api/questionnaires/${previewId}/preview?group=${previewGroup}&step=${index}&submission_key=${submissionKey}`
          : `/api/participate/${encodeURIComponent(token)}?submission_key=${submissionKey}`;
      return readResponse<Study>(await fetch(path, { cache: "no-store" }));
    },
    [previewId, previewGroup, submissionKey, token],
  );
  useEffect(() => {
    if (previewId == null && !session?.started) return;
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setStudy(data);
      })
      .catch((failure: Error) => {
        if (!cancelled) {
          setError(failure.message);
          if (failure instanceof RequestError && failure.status === 410)
            setClosed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load, previewId, session?.started]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function accept(data: Study) {
    setStudy(data);
    setGeneration((value) => value + 1);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const pending = session ?? { id: attemptKey(), started: false };
      sessionStorage.setItem("questionnaire-session", JSON.stringify(pending));
      setSession(pending);
      const data = await readResponse<
        Study & { access_token: string; submission_key: string }
      >(
        await fetch("/api/participate/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            key: individualKey,
            submission_key: pending.id,
          }),
        }),
      );
      const authenticated = {
        id: data.submission_key,
        started: true,
        token: data.access_token,
      };
      sessionStorage.setItem(
        "questionnaire-session",
        JSON.stringify(authenticated),
      );
      setSession(authenticated);
      setIndividualKey("");
      accept(data);
    } catch (failure) {
      if (failure instanceof RequestError && failure.status === 410)
        setClosed(true);
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to start or resume participation.",
      );
    } finally {
      setBusy(false);
    }
  }

  function signInAgain() {
    sessionStorage.removeItem("questionnaire-session");
    setSession(null);
    setStudy(null);
    setError("");
  }

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
                  void load()
                    .then(accept)
                    .catch((failure: Error) => setError(failure.message));
                }}
              >
                Restart preview
              </button>
            )}
          </section>
        ) : !preview && !session?.started ? (
          <section className="qa-panel">
            <h2>Start or resume participation</h2>
            <p>
              Enter your name, email and individual key. To resume, use the same
              details you entered at the start. Your saved progress will be
              restored.
            </p>
            <form className="qa-form" onSubmit={start}>
              <label>
                Name
                <input
                  required
                  maxLength={200}
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Individual key
                <input
                  required
                  maxLength={100}
                  autoComplete="off"
                  value={individualKey}
                  onChange={(event) => setIndividualKey(event.target.value)}
                  disabled={busy}
                />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? "Loading..." : "Start or resume questionnaire"}
              </button>
            </form>
          </section>
        ) : !study ? (
          <section className="qa-panel" aria-busy={!error}>
            <p role="status">
              {error
                ? "The questionnaire could not be loaded."
                : "Loading questionnaire..."}
            </p>
            <div className="qa-actions">
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
              {!preview && (
                <button
                  type="button"
                  className="qa-secondary"
                  onClick={signInAgain}
                >
                  Enter participation details again
                </button>
              )}
            </div>
          </section>
        ) : (
          <StudyForm
            key={`${study.current_step}:${generation}`}
            study={study}
            token={token}
            submissionKey={submissionKey}
            preview={!!preview}
            load={load}
            accept={accept}
          />
        )}
      </main>
    </div>
  );
}
