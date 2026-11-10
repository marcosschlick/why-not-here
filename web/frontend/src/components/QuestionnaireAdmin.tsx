import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { TacticalMapCanvas } from "./TacticalMapCanvas";
import type { MapAppearance, MapData } from "../types";
import "./questionnaire-admin.css";

type Point = [number, number];
type QuestionType =
  "text" | "choice" | "likert" | "numeric" | "route_choice" | "route_drawing";
type Question = {
  id: number;
  prompt: string;
  type: QuestionType;
  scenario_id: number | null;
  configuration: { options?: string[]; min?: number; max?: number };
  position: number;
};
type Questionnaire = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  access_token?: string | null;
  questions: Question[];
};
type Summary = Omit<Questionnaire, "questions">;
type Scenario = {
  id: number;
  title: string;
  configuration: Record<string, unknown>;
  appearance: MapAppearance | null;
  data: {
    map?: Partial<MapData>;
    start?: Point;
    goal?: Point;
    optimal_path?: Point[];
    alternative_path?: Point[];
  };
};
type Form = {
  prompt: string;
  type: QuestionType;
  scenarioId: string;
  options: string;
  min: string;
  max: string;
};
const emptyForm: Form = {
  prompt: "",
  type: "text",
  scenarioId: "",
  options: "",
  min: "",
  max: "",
};
const labels: Record<QuestionType, string> = {
  text: "Free text",
  choice: "Multiple choice",
  likert: "Likert scale",
  numeric: "Number",
  route_choice: "Choose a route",
  route_drawing: "Draw a route",
};

async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const detail = error?.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : detail?.message || `Request failed (${response.status}).`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

function ScenarioMap({
  scenario,
  showRoutes = true,
}: {
  scenario: Scenario;
  showRoutes?: boolean;
}) {
  const { map, start, goal, optimal_path, alternative_path } = scenario.data;
  if (
    !map?.h ||
    !map.w ||
    !map.terrain ||
    !map.elevation ||
    !map.obstacle ||
    !start ||
    !goal ||
    !scenario.appearance
  )
    return (
      <p className="qa-muted">Map data is unavailable for this scenario.</p>
    );
  const mapData = {
    ...map,
    start,
    goal,
    appearance: scenario.appearance,
    terrain_colors: scenario.configuration.TERRAIN_COLORS || {},
    optimal_path: optimal_path || [],
    auto_path: alternative_path || [],
    config: scenario.configuration,
    map_image_url: "",
  } as unknown as MapData;
  return (
    <div
      className="qa-map canvas-wrapper"
      aria-label={`Map for ${scenario.title}`}
    >
      <TacticalMapCanvas
        mapData={mapData}
        optimalPath={showRoutes ? optimal_path : []}
        userPath={showRoutes ? alternative_path : []}
        cellSize={Math.max(1, Math.min(12, 560 / Math.max(map.h, map.w)))}
      />
    </div>
  );
}

export function QuestionnaireAdmin({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Questionnaire | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scenarioTitle, setScenarioTitle] = useState("");
  const [height, setHeight] = useState("16");
  const [width, setWidth] = useState("16");
  const [seed, setSeed] = useState("");
  const [reduction, setReduction] = useState("PATH_ONLY");
  const [timeout, setTimeoutValue] = useState("60");
  const [exportKey, setExportKey] = useState("");

  const loadList = useCallback(
    async () => setList(await api<Summary[]>("/questionnaires")),
    [],
  );
  const loadQuestionnaire = useCallback(async (id: number) => {
    const [questionnaire, summaries] = await Promise.all([
      api<Questionnaire>(`/questionnaires/${id}`),
      api<{ id: number }[]>(`/questionnaires/${id}/scenarios`),
    ]);
    const details = await Promise.all(
      summaries.map((item) =>
        api<Scenario>(`/questionnaires/${id}/scenarios/${item.id}`),
      ),
    );
    setSelected(questionnaire);
    setTitle(questionnaire.title);
    setDescription(questionnaire.description || "");
    setScenarios(details);
    setSelectedScenario((previous) =>
      details.some((item) => item.id === previous)
        ? previous
        : details[0]?.id || null,
    );
  }, []);
  useEffect(() => {
    api<Summary[]>("/questionnaires")
      .then(setList)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  function select(id: number) {
    setExportKey("");
    void perform(async () => {
      await loadQuestionnaire(id);
      setEditing(null);
      setForm(emptyForm);
      setPreview(false);
    });
  }
  function newDraft() {
    setExportKey("");
    setSelected(null);
    setTitle("");
    setDescription("");
    setScenarios([]);
    setForm(emptyForm);
    setEditing(null);
    setPreview(false);
    setError("");
  }
  function saveDraft(event: FormEvent) {
    event.preventDefault();
    void perform(async () => {
      const item = await api<Summary>(
        selected ? `/questionnaires/${selected.id}` : "/questionnaires",
        selected ? "PUT" : "POST",
        { title, description: description || null },
      );
      await loadList();
      await loadQuestionnaire(item.id);
    });
  }
  function exportResults(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    void perform(async () => {
      const response = await fetch(
        `/api/questionnaires/${selected.id}/export`,
        {
          headers: { "X-Export-Key": exportKey },
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : "Unable to export results.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `questionnaire-${selected.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportKey("");
    });
  }
  function editQuestion(question: Question) {
    setEditing(question.id);
    setForm({
      prompt: question.prompt,
      type: question.type,
      scenarioId: question.scenario_id?.toString() || "",
      options: question.configuration.options?.join("\n") || "",
      min: question.configuration.min?.toString() ?? "",
      max: question.configuration.max?.toString() ?? "",
    });
  }
  function saveQuestion(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    void perform(async () => {
      const configuration: { options?: string[]; min?: number; max?: number } =
        {};
      if (form.type === "choice")
        configuration.options = form.options
          .split("\n")
          .map((option) => option.trim())
          .filter(Boolean);
      if (form.type === "likert" || form.type === "numeric") {
        if (form.min !== "") configuration.min = Number(form.min);
        if (form.max !== "") configuration.max = Number(form.max);
      }
      const body = {
        type: form.type,
        prompt: form.prompt,
        configuration,
        ...(form.type === "route_choice" || form.type === "route_drawing"
          ? { scenario_id: Number(form.scenarioId) }
          : {}),
      };
      await api(
        `/questionnaires/${selected.id}/questions${editing ? `/${editing}` : ""}`,
        editing ? "PUT" : "POST",
        body,
      );
      await loadQuestionnaire(selected.id);
      setEditing(null);
      setForm(emptyForm);
    });
  }
  function removeQuestion(id: number) {
    if (!selected || !window.confirm("Delete this question?")) return;
    void perform(async () => {
      await api(`/questionnaires/${selected.id}/questions/${id}`, "DELETE");
      await loadQuestionnaire(selected.id);
      if (editing === id) {
        setEditing(null);
        setForm(emptyForm);
      }
    });
  }
  function moveQuestion(index: number, direction: number) {
    if (!selected) return;
    const ids = selected.questions.map((question) => question.id);
    const next = index + direction;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    void perform(async () => {
      await api(`/questionnaires/${selected.id}/questions/order`, "PUT", {
        question_ids: ids,
      });
      await loadQuestionnaire(selected.id);
    });
  }
  function generateScenario(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    void perform(async () => {
      const config = {
        MAP_H: Number(height),
        MAP_W: Number(width),
        ...(seed === "" ? {} : { MAP_DEFAULT_SEED: Number(seed) }),
        DEFAULT_REDUCTION_METHOD: reduction,
        SOLVER_TIMEOUT_SEC: Number(timeout),
      };
      const item = await api<Scenario>(
        `/questionnaires/${selected.id}/scenarios`,
        "POST",
        { title: scenarioTitle, config },
      );
      await loadQuestionnaire(selected.id);
      setSelectedScenario(item.id);
      setScenarioTitle("");
    });
  }
  const currentScenario = scenarios.find(
    (item) => item.id === selectedScenario,
  );
  const editable = !selected || selected.status === "draft";

  return (
    <div className="qa-app">
      <header className="qa-header">
        <div>
          <span className="qa-overline">WHY NOT HERE? / RESEARCH TOOLS</span>
          <h1>Questionnaire administration</h1>
        </div>
        <button type="button" onClick={onBack} className="qa-ghost">
          ← Back to simulation
        </button>
      </header>
      <div className="qa-layout">
        <aside className="qa-sidebar">
          <div className="qa-side-heading">
            <h2>Questionnaires</h2>
            <button type="button" onClick={newDraft} disabled={busy}>
              + New
            </button>
          </div>
          <p className="qa-muted">Create and manage local drafts.</p>
          {list.length === 0 && (
            <p className="qa-muted">No questionnaires yet.</p>
          )}
          <nav aria-label="Questionnaires">
            {list.map((item) => (
              <button
                className={`qa-list-item ${selected?.id === item.id ? "is-active" : ""}`}
                key={item.id}
                onClick={() => select(item.id)}
                disabled={busy}
                type="button"
              >
                <strong>{item.title}</strong>
                <span>{item.status}</span>
              </button>
            ))}
          </nav>
        </aside>
        <main className="qa-content">
          {error && (
            <div className="qa-error" role="alert">
              {error}
            </div>
          )}
          {busy && (
            <p role="status" className="qa-notice">
              Working… scenario generation may take several minutes.
            </p>
          )}
          <section className="qa-panel">
            <div className="qa-heading">
              <div>
                <span className="qa-overline">
                  {selected
                    ? `${selected.status.toUpperCase()} / ${selected.id}`
                    : "NEW QUESTIONNAIRE"}
                </span>
                <h2>
                  {selected ? "Questionnaire details" : "Start a questionnaire"}
                </h2>
                <p className="qa-muted">
                  Give your study a clear title and description.
                </p>
              </div>
              {selected && (
                <button
                  type="button"
                  onClick={() => setPreview(!preview)}
                  className="qa-secondary"
                >
                  {preview ? "Back to editor" : "Preview questionnaire"}
                </button>
              )}
            </div>
            {selected?.status === "draft" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Activate this questionnaire? It can no longer be edited.",
                    )
                  )
                    return;
                  void perform(async () => {
                    await api(
                      `/questionnaires/${selected.id}/activate`,
                      "POST",
                    );
                    await loadList();
                    await loadQuestionnaire(selected.id);
                  });
                }}
              >
                Activate questionnaire
              </button>
            )}
            {selected?.status === "active" && selected.access_token && (
              <label className="qa-form">
                Participant link
                <input
                  readOnly
                  value={`${window.location.origin}${window.location.pathname}#/participate/${selected.access_token}`}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            )}
            {selected && (
              <form onSubmit={exportResults} className="qa-form">
                <label>
                  Export key
                  <input
                    type="password"
                    autoComplete="off"
                    required
                    value={exportKey}
                    onChange={(event) => setExportKey(event.target.value)}
                    disabled={busy}
                  />
                </label>
                <button type="submit" className="qa-secondary" disabled={busy}>
                  Download results (JSON)
                </button>
              </form>
            )}
            {!preview && (
              <form onSubmit={saveDraft} className="qa-form">
                <label>
                  Title
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={busy || !editable}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={busy || !editable}
                  />
                </label>
                <button disabled={busy || !editable} type="submit">
                  {selected ? "Save details" : "Create draft"}
                </button>
              </form>
            )}
          </section>
          {selected && preview && (
            <section className="qa-panel qa-preview">
              <span className="qa-overline">READ-ONLY PREVIEW</span>
              <h2>{selected.title}</h2>
              {selected.description && <p>{selected.description}</p>}
              {selected.questions.length === 0 && (
                <p className="qa-muted">
                  This questionnaire has no questions yet.
                </p>
              )}
              {selected.questions.map((q, i) => {
                const scenario = scenarios.find((s) => s.id === q.scenario_id);
                return (
                  <article className="qa-preview-question" key={q.id}>
                    <span className="qa-overline">
                      QUESTION {i + 1} / {labels[q.type]}
                    </span>
                    <h3>{q.prompt}</h3>
                    {q.type === "choice" && (
                      <ul>
                        {q.configuration.options?.map((option, n) => (
                          <li key={n}>{option}</li>
                        ))}
                      </ul>
                    )}
                    {q.type === "likert" && (
                      <p>
                        Scale: {q.configuration.min}–{q.configuration.max}
                      </p>
                    )}
                    {q.type === "numeric" && (
                      <p>
                        Numeric response
                        {q.configuration.min != null
                          ? ` · Minimum ${q.configuration.min}`
                          : ""}
                        {q.configuration.max != null
                          ? ` · Maximum ${q.configuration.max}`
                          : ""}
                      </p>
                    )}
                    {q.type === "text" && (
                      <p className="qa-muted">Free-text response</p>
                    )}
                    {(q.type === "route_choice" ||
                      q.type === "route_drawing") &&
                      (scenario ? (
                        <>
                          <p className="qa-muted">{scenario.title}</p>
                          <ScenarioMap
                            scenario={scenario}
                            showRoutes={q.type === "route_choice"}
                          />
                          {q.type === "route_choice" && (
                            <p>Options: Optimal route / Alternative route</p>
                          )}
                        </>
                      ) : (
                        <p className="qa-muted">Scenario unavailable.</p>
                      ))}
                  </article>
                );
              })}
            </section>
          )}
          {selected && !preview && (
            <>
              <section className="qa-panel">
                <div className="qa-heading">
                  <div>
                    <span className="qa-overline">01 / BUILD</span>
                    <h2>
                      Questions{" "}
                      <span className="qa-count">
                        {selected.questions.length}
                      </span>
                    </h2>
                    <p className="qa-muted">
                      Edit questions and arrange their presentation order.
                    </p>
                  </div>
                </div>
                {selected.questions.length === 0 && (
                  <p className="qa-empty">Add the first question below.</p>
                )}
                <ol className="qa-questions">
                  {selected.questions.map((q, i) => (
                    <li key={q.id}>
                      <div>
                        <span className="qa-question-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <strong>{q.prompt}</strong>
                        <small>
                          {labels[q.type]}
                          {q.scenario_id ? ` · Scenario ${q.scenario_id}` : ""}
                        </small>
                      </div>
                      <div className="qa-actions">
                        <button
                          type="button"
                          aria-label={`Move question ${i + 1} up`}
                          disabled={busy || !editable || i === 0}
                          onClick={() => moveQuestion(i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Move question ${i + 1} down`}
                          disabled={
                            busy ||
                            !editable ||
                            i === selected.questions.length - 1
                          }
                          onClick={() => moveQuestion(i, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          disabled={busy || !editable}
                          onClick={() => editQuestion(q)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy || !editable}
                          onClick={() => removeQuestion(q.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
                <form
                  onSubmit={saveQuestion}
                  className="qa-form qa-question-form"
                >
                  <h3>{editing ? "Edit question" : "Add a question"}</h3>
                  <label>
                    Question type
                    <select
                      value={form.type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          type: e.target.value as QuestionType,
                        })
                      }
                      disabled={busy || !editable}
                    >
                      {Object.entries(labels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prompt
                    <input
                      value={form.prompt}
                      onChange={(e) =>
                        setForm({ ...form, prompt: e.target.value })
                      }
                      required
                      disabled={busy || !editable}
                    />
                  </label>
                  {form.type === "choice" && (
                    <label>
                      Options{" "}
                      <span className="qa-muted">
                        one per line, at least two
                      </span>
                      <textarea
                        required
                        rows={3}
                        value={form.options}
                        onChange={(e) =>
                          setForm({ ...form, options: e.target.value })
                        }
                        disabled={busy || !editable}
                      />
                    </label>
                  )}
                  {(form.type === "likert" || form.type === "numeric") && (
                    <div className="qa-fields">
                      <label>
                        Minimum
                        <input
                          type="number"
                          step={form.type === "likert" ? "1" : "any"}
                          required={form.type === "likert"}
                          value={form.min}
                          onChange={(e) =>
                            setForm({ ...form, min: e.target.value })
                          }
                          disabled={busy || !editable}
                        />
                      </label>
                      <label>
                        Maximum
                        <input
                          type="number"
                          step={form.type === "likert" ? "1" : "any"}
                          required={form.type === "likert"}
                          value={form.max}
                          onChange={(e) =>
                            setForm({ ...form, max: e.target.value })
                          }
                          disabled={busy || !editable}
                        />
                      </label>
                    </div>
                  )}
                  {(form.type === "route_choice" ||
                    form.type === "route_drawing") && (
                    <label>
                      Scenario
                      <select
                        required
                        value={form.scenarioId}
                        onChange={(e) =>
                          setForm({ ...form, scenarioId: e.target.value })
                        }
                        disabled={busy || !editable}
                      >
                        <option value="">Select a saved scenario</option>
                        {scenarios.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="qa-actions">
                    <button type="submit" disabled={busy || !editable}>
                      {editing ? "Save question" : "Add question"}
                    </button>
                    {editing && (
                      <button
                        type="button"
                        className="qa-secondary"
                        onClick={() => {
                          setEditing(null);
                          setForm(emptyForm);
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </section>
              <section className="qa-panel">
                <div className="qa-heading">
                  <div>
                    <span className="qa-overline">02 / SCENARIOS</span>
                    <h2>
                      Saved scenarios{" "}
                      <span className="qa-count">{scenarios.length}</span>
                    </h2>
                    <p className="qa-muted">
                      Generate a new map and its routes for this draft.
                    </p>
                  </div>
                </div>
                <form className="qa-form" onSubmit={generateScenario}>
                  <label>
                    Scenario name
                    <input
                      required
                      value={scenarioTitle}
                      onChange={(e) => setScenarioTitle(e.target.value)}
                      disabled={busy || !editable}
                    />
                  </label>
                  <div className="qa-fields">
                    <label>
                      Height
                      <input
                        type="number"
                        min="4"
                        max="8192"
                        required
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                        disabled={busy || !editable}
                      />
                    </label>
                    <label>
                      Width
                      <input
                        type="number"
                        min="4"
                        max="8192"
                        required
                        value={width}
                        onChange={(e) => setWidth(e.target.value)}
                        disabled={busy || !editable}
                      />
                    </label>
                    <label>
                      Seed <span className="qa-muted">optional</span>
                      <input
                        type="number"
                        step="1"
                        value={seed}
                        onChange={(e) => setSeed(e.target.value)}
                        disabled={busy || !editable}
                      />
                    </label>
                    <label>
                      Solver timeout (seconds)
                      <input
                        type="number"
                        min="1"
                        required
                        value={timeout}
                        onChange={(e) => setTimeoutValue(e.target.value)}
                        disabled={busy || !editable}
                      />
                    </label>
                    <label>
                      Graph reduction
                      <select
                        value={reduction}
                        onChange={(e) => setReduction(e.target.value)}
                        disabled={busy || !editable}
                      >
                        {[
                          "NONE",
                          "BBOX",
                          "FLOODFILL",
                          "SPARSIFIED",
                          "PATH_ONLY",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button type="submit" disabled={busy || !editable}>
                    Generate scenario
                  </button>
                </form>
                {scenarios.length > 0 && (
                  <div className="qa-scenario-view">
                    <label>
                      View scenario
                      <select
                        value={selectedScenario || ""}
                        onChange={(e) =>
                          setSelectedScenario(Number(e.target.value))
                        }
                      >
                        {scenarios.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {currentScenario && (
                      <ScenarioMap scenario={currentScenario} />
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
