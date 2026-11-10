import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { RouteCanvas } from "./RouteCanvas";
import { TacticalMapCanvas } from "./TacticalMapCanvas";
import type { MapAppearance, MapData } from "../types";
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
type Question = {
  id: number;
  prompt: string;
  type:
    "text" | "choice" | "likert" | "numeric" | "route_choice" | "route_drawing";
  configuration: { options?: string[]; min?: number; max?: number };
  scenario?: Scenario;
};
type Questionnaire = {
  title: string;
  description: string | null;
  submission_completed: boolean;
  questions: Question[];
};
type Answer = string | number | Point[];

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
  return (
    <div className="qa-map canvas-wrapper">
      <TacticalMapCanvas
        mapData={map}
        userPath={path}
        cellSize={Math.max(1, Math.min(12, 560 / Math.max(map.h, map.w)))}
      />
    </div>
  );
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
      <div className="qa-actions" role="group" aria-label="Move route endpoint">
        <button type="button" onClick={() => step(-1, 0)}>
          ↑
        </button>
        <button type="button" onClick={() => step(0, -1)}>
          ←
        </button>
        <button type="button" onClick={() => step(0, 1)}>
          →
        </button>
        <button type="button" onClick={() => step(1, 0)}>
          ↓
        </button>
        {map.connectivity === 8 && (
          <>
            <button type="button" onClick={() => step(-1, -1)}>
              ↖
            </button>
            <button type="button" onClick={() => step(-1, 1)}>
              ↗
            </button>
            <button type="button" onClick={() => step(1, -1)}>
              ↙
            </button>
            <button type="button" onClick={() => step(1, 1)}>
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

export function Participant({ token }: { token: string }) {
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(
    null,
  );
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submissionKey] = useState(() => {
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
    fetch(
      `/api/participate/${encodeURIComponent(token)}?submission_key=${encodeURIComponent(submissionKey)}`,
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error("This questionnaire link is unavailable.");
        return response.json();
      })
      .then(setQuestionnaire)
      .catch((reason: Error) => setError(reason.message));
  }, [token, submissionKey]);
  function update(id: number, value: Answer) {
    setAnswers((current) => ({ ...current, [id]: value }));
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
      if (question.type === "route_drawing") {
        const path = value as Point[];
        const goal = question.scenario!.goal;
        const last = path[path.length - 1];
        if (!last || last[0] !== goal[0] || last[1] !== goal[1]) {
          setError("Draw a route that reaches the goal before submitting.");
          return;
        }
      }
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
        if (response.status === 409) setConflict(true);
        const body = await response.json().catch(() => null);
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
    <div className="qa-app">
      <header className="qa-header">
        <div>
          <span className="qa-overline">WHY NOT HERE? / RESEARCH STUDY</span>
          <h1>Questionnaire</h1>
        </div>
      </header>
      <main className="qa-content qa-participant">
        {error && (
          <div role="alert" className="qa-error">
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
            <p>Your answers have been submitted.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Start a new participation
            </button>
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
                    {q.type === "text" && (
                      <textarea
                        aria-label={q.prompt}
                        required
                        value={(answers[q.id] as string) || ""}
                        onChange={(e) => update(q.id, e.target.value)}
                      />
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
                    {q.type === "likert" && (
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
                    )}
                    {q.type === "numeric" && (
                      <label className="qa-response-label">
                        Number
                        <input
                          type="number"
                          step="any"
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
                    )}
                    {q.type === "route_choice" &&
                      q.scenario?.routes?.map((path, i) => (
                        <label className="qa-route-option" key={i}>
                          <span>
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              checked={answers[q.id] === i}
                              onChange={() => update(q.id, i)}
                              required
                            />{" "}
                            Route {i === 0 ? "A" : "B"}
                          </span>
                          <RouteOption scenario={q.scenario!} path={path} />
                        </label>
                      ))}
                    {q.type === "route_drawing" && q.scenario && (
                      <DrawingAnswer
                        scenario={q.scenario}
                        value={(answers[q.id] as Point[]) || [q.scenario.start]}
                        onChange={(value) => update(q.id, value)}
                      />
                    )}
                  </fieldset>
                </section>
              ))}
              <button type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit answers"}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
