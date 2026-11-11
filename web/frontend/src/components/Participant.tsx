import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { RouteCanvas } from "./RouteCanvas";
import { ScenarioMapView } from "./ScenarioMapView";
import type { MapAppearance, MapData } from "../types";
import { validateDrawingRoute } from "../utils/validateRoute";
import "./questionnaire-admin.css";

type Point = [number, number];
type Scenario = {
  map: Partial<MapData>;
  start: Point;
  goal: Point;
  terrain_colors: Record<string, string>;
  appearance: MapAppearance;
  routes?: Point[][];
};
export type ParticipantQuestion = {
  id: number;
  prompt: string;
  type:
    "text" | "choice" | "likert" | "numeric" | "route_choice" | "route_drawing";
  configuration: { options?: string[]; min?: number; max?: number };
  scenario?: Scenario;
  justification?: string;
  justification_pending?: boolean;
  confirmed_choice?: number | null;
  preview_scenario_id?: number | null;
  preview_justification?: string;
};
export type ParticipantQuestionnaire = {
  title: string;
  description: string | null;
  submission_completed: boolean;
  questions: ParticipantQuestion[];
};
type Answer = string | number | Point[];

const LIKERT_OPTIONS = [
  { value: 1, label: "Strongly disagree" },
  { value: 2, label: "Somewhat disagree" },
  { value: 3, label: "Neither agree nor disagree" },
  { value: 4, label: "Somewhat agree" },
  { value: 5, label: "Strongly agree" },
];

function toMap(scenario: Scenario): MapData {
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

function RouteOption({
  scenario,
  path,
}: {
  scenario: Scenario;
  path: Point[];
}) {
  const map = useMemo(() => toMap(scenario), [scenario]);
  return <ScenarioMapView mapData={map} userPath={path} alternativePathLabel="Route" />;
}

function DrawingAnswer({
  scenario,
  value,
  onChange,
}: {
  scenario: Scenario;
  value: Point[];
  onChange: (value: Point[]) => void;
}) {
  const map = useMemo(() => toMap(scenario), [scenario]);
  const last = value[value.length - 1] || scenario.start;
  function step(dr: number, dc: number) {
    const next: Point = [last[0] + dr, last[1] + dc];
    if (
      next[0] < 0 ||
      next[1] < 0 ||
      next[0] >= map.h ||
      next[1] >= map.w ||
      value.some((p) => p[0] === next[0] && p[1] === next[1])
    )
      return;
    if (last[0] === scenario.goal[0] && last[1] === scenario.goal[1]) return;
    onChange([...value, next]);
  }
  return (
    <div>
      <RouteCanvas
        mapData={map}
        userPath={value}
        onPathChange={onChange}
        onSolve={() => {}}
        isSolving={false}
        participantMode
      />
      <div
        className="qa-actions qa-direction-controls"
        role="group"
        aria-label="Move route endpoint"
      >
        <button type="button" aria-label="Move up" onClick={() => step(-1, 0)}>
          ↑
        </button>
        <button
          type="button"
          aria-label="Move left"
          onClick={() => step(0, -1)}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Move right"
          onClick={() => step(0, 1)}
        >
          →
        </button>
        <button type="button" aria-label="Move down" onClick={() => step(1, 0)}>
          ↓
        </button>
        {map.connectivity === 8 && (
          <>
            <button
              type="button"
              aria-label="Move up and left"
              onClick={() => step(-1, -1)}
            >
              ↖
            </button>
            <button
              type="button"
              aria-label="Move up and right"
              onClick={() => step(-1, 1)}
            >
              ↗
            </button>
            <button
              type="button"
              aria-label="Move down and left"
              onClick={() => step(1, -1)}
            >
              ↙
            </button>
            <button
              type="button"
              aria-label="Move down and right"
              onClick={() => step(1, 1)}
            >
              ↘
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() =>
            onChange(value.length > 1 ? value.slice(0, -1) : value)
          }
        >
          Remove last point
        </button>
      </div>
    </div>
  );
}

export function Participant({
  token = "",
  preview,
}: {
  token?: string;
  preview?: ParticipantQuestionnaire;
}) {
  const [questionnaire, setQuestionnaire] =
    useState<ParticipantQuestionnaire | null>(preview ?? null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const [completed, setCompleted] = useState(false);
  const [closed, setClosed] = useState(false);
  const [submissionKey] = useState(() => {
    if (preview) return "";
    const key = `participation:${token}`;
    let value = sessionStorage.getItem(key);
    if (!value) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      value = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      sessionStorage.setItem(key, value);
    }
    return value;
  });
  useEffect(() => {
    if (preview) return;
    fetch(
      `/api/participate/${encodeURIComponent(token)}?submission_key=${encodeURIComponent(submissionKey)}`,
    )
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            typeof body?.detail === "string"
              ? body.detail
              : "This questionnaire link is unavailable.",
          );
        }
        return response.json();
      })
      .then((data: ParticipantQuestionnaire) => {
        setQuestionnaire(data);
        setAnswers((current) => {
          const next = { ...current };
          for (const question of data.questions) {
            if (question.confirmed_choice != null)
              next[question.id] = question.confirmed_choice;
          }
          return next;
        });
      })
      .catch((reason: Error) => setError(reason.message));
  }, [token, submissionKey, preview]);
  function update(id: number, value: Answer) {
    setAnswers((current) => ({ ...current, [id]: value }));
  }
  async function confirmChoice(question: ParticipantQuestion) {
    const choice = answers[question.id];
    if (typeof choice !== "number") return;
    setBusy(true);
    setConfirming(question.id);
    setError("");
    try {
      if (preview) {
        setQuestionnaire((current) => {
          if (!current) return current;
          const updated = current.questions.map((item) =>
            item.id === question.id
              ? { ...item, confirmed_choice: choice }
              : item,
          );
          return {
            ...current,
            questions: updated.map((item) => {
              const pending =
                item.preview_scenario_id != null &&
                updated.some(
                  (other) =>
                    other.preview_scenario_id === item.preview_scenario_id &&
                    other.type === "route_choice" &&
                    other.confirmed_choice == null,
                );
              return {
                ...item,
                justification_pending: pending,
                justification: pending ? undefined : item.preview_justification,
              };
            }),
          };
        });
      } else {
        const response = await fetch(
          `/api/participate/${encodeURIComponent(token)}/questions/${question.id}/confirm`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submission_key: submissionKey, choice }),
          },
        );
        if (!response.ok) {
          if (response.status === 410) setClosed(true);
          const body = await response.json().catch(() => null);
          throw new Error(
            typeof body?.detail === "string"
              ? body.detail
              : "Unable to confirm route choice.",
          );
        }
        setQuestionnaire((current) =>
          current
            ? {
                ...current,
                questions: current.questions.map((item) =>
                  item.id === question.id
                    ? { ...item, confirmed_choice: choice }
                    : item,
                ),
              }
            : current,
        );
        const refreshed = await fetch(
          `/api/participate/${encodeURIComponent(token)}?submission_key=${encodeURIComponent(submissionKey)}`,
        );
        if (!refreshed.ok)
          throw new Error(
            "Choice confirmed. Refresh the page to load the justification.",
          );
        setQuestionnaire(await refreshed.json());
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to confirm route choice.",
      );
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!questionnaire) return;
    const entries = questionnaire.questions.map((q) => ({
      question_id: q.id,
      value: answers[q.id],
    }));
    for (const question of questionnaire.questions) {
      const value = answers[question.id];
      if (value === undefined || (typeof value === "string" && !value.trim())) {
        setError("Please answer every question before submitting.");
        return;
      }
      if (question.type === "text") {
        const text = (value as string).trim();
        if (text.length > 1000) {
          setError(
            `Question ${questionnaire.questions.indexOf(question) + 1}: Response exceeds the 1000-character limit.`,
          );
          return;
        }
      }
      if (question.type === "numeric") {
        const num = value as number;
        if (typeof num !== "number" || !Number.isFinite(num) || num < 0 || num > 100) {
          setError(
            `Question ${questionnaire.questions.indexOf(question) + 1}: Please enter a number between 0 and 100.`,
          );
          return;
        }
      }
      if (question.type === "likert") {
        const num = value as number;
        const min = question.configuration.min ?? 1;
        const max = question.configuration.max ?? 5;
        if (typeof num !== "number" || !Number.isInteger(num) || num < min || num > max) {
          setError(
            `Question ${questionnaire.questions.indexOf(question) + 1}: Please select a value between ${min} and ${max}.`,
          );
          return;
        }
      }
      if (
        question.type === "route_choice" &&
        question.confirmed_choice !== value
      ) {
        setError(
          `Confirm your route choice for question ${questionnaire.questions.indexOf(question) + 1}.`,
        );
        return;
      }
      if (question.type === "route_drawing") {
        const path = value as Point[];
        const scenario = question.scenario!;
        const message = validateDrawingRoute(
          path,
          scenario.start,
          scenario.goal,
          scenario.map.h!,
          scenario.map.w!,
          scenario.map.connectivity!,
        );
        if (message) {
          setError(
            `Question ${questionnaire.questions.indexOf(question) + 1}: ${message}`,
          );
          return;
        }
      }
    }
    if (preview) {
      setCompleted(true);
      return;
    }
    setBusy(true);
    setError("");
    setConflict(false);
    try {
      const response = await fetch(
        `/api/participate/${encodeURIComponent(token)}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submission_key: submissionKey,
            answers: entries,
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 410) setClosed(true);
        const body = await response.json().catch(() => null);
        if (
          response.status === 409 &&
          body?.detail ===
            "This submission was already completed with different answers"
        )
          setConflict(true);
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : "Unable to submit answers.",
        );
      }
      if (sessionStorage.getItem(`participation:${token}`) === submissionKey) {
        sessionStorage.removeItem(`participation:${token}`);
      }
      setCompleted(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to submit answers.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`qa-app ${preview ? "qa-preview-app" : ""}`}>
      {!preview && (
        <header className="qa-header">
          <div>
            <span className="qa-overline">WHY NOT HERE? / RESEARCH STUDY</span>
            <h1>Questionnaire</h1>
          </div>
        </header>
      )}
      <main className="qa-content qa-participant">
        {error && (
          <div role="alert" className="qa-error" tabIndex={-1} ref={errorRef}>
            {error}
          </div>
        )}
        {(conflict || questionnaire?.submission_completed) && !completed && (
          <div className="qa-notice">
            <p>
              {conflict
                ? "This submission was already completed with different answers."
                : "This browser has an already completed submission for this questionnaire."}{" "}
              Starting again creates a separate participation.
            </p>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem(`participation:${token}`);
                window.location.reload();
              }}
            >
              Start a new participation
            </button>
          </div>
        )}
        {completed ? (
          <section className="qa-panel">
            <h2>Thank you for participating</h2>
            <p>
              {preview
                ? "Preview complete. No answers were saved."
                : "Your answers have been submitted."}
            </p>
            <button
              type="button"
              onClick={() => {
                if (preview) {
                  setQuestionnaire(preview);
                  setAnswers({});
                  setCompleted(false);
                } else window.location.reload();
              }}
            >
              Start a new participation
            </button>
          </section>
        ) : closed ? (
          <section className="qa-panel">
            <h2>Questionnaire closed</h2>
            <p>This questionnaire is no longer accepting answers.</p>
          </section>
        ) : !questionnaire ? (
          !error && <p role="status">Loading questionnaire…</p>
        ) : (
          <>
            <section className="qa-panel">
              <span className="qa-overline">PARTICIPANT QUESTIONNAIRE</span>
              <h2>{questionnaire.title}</h2>
              {questionnaire.description && <p>{questionnaire.description}</p>}
              <p className="qa-muted">
                All questions are required. Your answers are submitted together.
              </p>
            </section>
            <form onSubmit={submit} className="qa-participant-form">
              {questionnaire.questions.map((q, index) => (
                <section className="qa-panel" key={q.id}>
                  <fieldset disabled={busy} className="qa-fieldset">
                    <legend>
                      <span className="qa-overline">
                        QUESTION {index + 1} / {questionnaire.questions.length}
                      </span>
                      <br />
                      <strong>{q.prompt}</strong>
                    </legend>
                    {q.justification_pending && (
                      <p className="qa-notice">
                        Confirm all route choices for this scenario to view the
                        justification.
                      </p>
                    )}
                    {q.justification && q.type !== "route_choice" && (
                      <div className="qa-justification">
                        <strong>Justification</strong>
                        <p>{q.justification}</p>
                      </div>
                    )}
                    {q.type === "text" && (
                      <div className="qa-text-response">
                        <textarea
                          aria-label={q.prompt}
                          required
                          maxLength={1000}
                          value={(answers[q.id] as string) || ""}
                          onChange={(e) => update(q.id, e.target.value)}
                        />
                        <span className="qa-text-counter">
                          {((answers[q.id] as string) || "").length} / 1000
                        </span>
                      </div>
                    )}
                    {q.type === "choice" &&
                      q.configuration.options?.map((option, i) => (
                        <label className="qa-option" key={i}>
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            checked={answers[q.id] === i}
                            onChange={() => update(q.id, i)}
                            required
                          />
                          {option}
                        </label>
                      ))}
                    {q.type === "likert" &&
                      (q.configuration.min ?? 1) === 1 &&
                      (q.configuration.max ?? 5) === 5 ? (
                        <div className="qa-likert-group" role="radiogroup" aria-label={q.prompt}>
                          {LIKERT_OPTIONS.map((opt) => (
                            <label className="qa-option" key={opt.value}>
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                checked={answers[q.id] === opt.value}
                                onChange={() => update(q.id, opt.value)}
                                required
                              />
                              <span>
                                {opt.value}. {opt.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        q.type === "likert" && (
                          <label className="qa-response-label">
                            Choose a value ({q.configuration.min}–
                            {q.configuration.max})
                            <input
                              type="number"
                              step="1"
                              min={q.configuration.min}
                              max={q.configuration.max}
                              required
                              value={(answers[q.id] as number | undefined) ?? ""}
                              onChange={(e) =>
                                e.target.value === ""
                                  ? setAnswers((a) => {
                                      const next = { ...a };
                                      delete next[q.id];
                                      return next;
                                    })
                                  : update(q.id, Number(e.target.value))
                              }
                            />
                          </label>
                        )
                      )}
                    {q.type === "numeric" && (
                      <label className="qa-response-label">
                        Choose a value (0–100)
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          required
                          value={(answers[q.id] as number | undefined) ?? ""}
                          onChange={(e) =>
                            e.target.value === ""
                              ? setAnswers((a) => {
                                  const next = { ...a };
                                  delete next[q.id];
                                  return next;
                                })
                              : update(q.id, Number(e.target.value))
                          }
                        />
                      </label>
                    )}
                    {q.type === "route_choice" &&
                      q.scenario?.routes?.map((path, i) => (
                        <div className="qa-route-option" key={i}>
                          <label>
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              checked={answers[q.id] === i}
                              onChange={() => update(q.id, i)}
                              disabled={q.confirmed_choice != null}
                              required
                            />{" "}
                            Route {i === 0 ? "A" : "B"}
                          </label>
                          <RouteOption scenario={q.scenario!} path={path} />
                        </div>
                      ))}
                    {q.type === "route_choice" && (
                      <>
                        {q.confirmed_choice == null && (
                          <p className="qa-muted">
                            Your choice will be locked after confirmation.
                          </p>
                        )}
                        {confirming === q.id && (
                          <p role="status">Confirming route choice…</p>
                        )}
                        {q.confirmed_choice == null ? (
                          <button
                            type="button"
                            disabled={busy || typeof answers[q.id] !== "number"}
                            onClick={() => void confirmChoice(q)}
                          >
                            Confirm route choice
                          </button>
                        ) : (
                          <p role="status">Route choice confirmed.</p>
                        )}
                        {q.justification && (
                          <div className="qa-justification">
                            <strong>Justification</strong>
                            <p>{q.justification}</p>
                          </div>
                        )}
                      </>
                    )}
                    {q.type === "route_drawing" && q.scenario && (
                      <>
                        <DrawingAnswer
                          scenario={q.scenario}
                          value={
                            (answers[q.id] as Point[]) || [q.scenario.start]
                          }
                          onChange={(value) => update(q.id, value)}
                        />
                        {Array.isArray(answers[q.id]) && (
                          <p role="status" className="qa-muted">
                            {validateDrawingRoute(
                              answers[q.id] as Point[],
                              q.scenario.start,
                              q.scenario.goal,
                              q.scenario.map.h!,
                              q.scenario.map.w!,
                              q.scenario.map.connectivity!,
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </fieldset>
                </section>
              ))}
              <button type="submit" disabled={busy}>
                {busy && confirming === null ? "Submitting…" : "Submit answers"}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
