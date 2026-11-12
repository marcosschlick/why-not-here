import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { Participant } from "./Participant";
import type { ParticipantQuestionnaire } from "./Participant";
import { ScenarioMapView } from "./ScenarioMapView";
import { Topbar } from "./Topbar";
import type { MapAppearance, MapData, SemanticModificationsData } from "../types";
import "./questionnaire-admin.css";

type Point = [number, number];
type QuestionType =
  | "route_choice"
  | "numeric"
  | "text"
  | "likert"
  | "route_drawing";
type Question = {
  id: number;
  prompt: string;
  type: QuestionType | "choice";
  scenario_id: number | null;
  configuration: { options?: string[]; min?: number; max?: number; max_length?: number };
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
  terrain_colors: Record<string, string>;
  data: {
    map?: Partial<MapData>;
    modifications?: SemanticModificationsData | null;
    cost_baseline_text?: string;
    explanation_text?: string;
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
};
const emptyForm: Form = {
  prompt: "",
  type: "route_choice",
  scenarioId: "",
};
const labels: Record<QuestionType, string> = {
  route_choice: "Choose a route",
  numeric: "Number",
  text: "Free text",
  likert: "Likert scale",
  route_drawing: "Draw a route",
};
const displayLabels: Record<string, string> = {
  ...labels,
  choice: "Multiple choice (legacy)",
};

function participantLink(token: string): string | null {
  const base = import.meta.env.VITE_PUBLIC_BASE_URL;
  if (!base) return null;
  try {
    const url = new URL(base);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    url.hash = `/participate/${token}`;
    return url.toString();
  } catch {
    return null;
  }
}

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
}: {
  scenario: Scenario;
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
    terrain_colors: scenario.terrain_colors,
    optimal_path: optimal_path || [],
    auto_path: alternative_path || [],
    config: scenario.configuration,
    map_image_url: "",
  } as unknown as MapData;
  return (
    <ScenarioMapView
      mapData={mapData}
      optimalPath={optimal_path}
      userPath={alternative_path}
      modifications={scenario.data.modifications}
    />
  );
}

function buildPreview(
  questionnaire: Questionnaire,
  scenarios: Scenario[],
  group: "control" | "experimental",
): ParticipantQuestionnaire {
  return {
    title: questionnaire.title,
    description: questionnaire.description,
    submission_completed: false,
    questions: questionnaire.questions.map((question) => {
      const saved = scenarios.find((item) => item.id === question.scenario_id);
      const data = saved?.data;
      const previewRoute = questionnaire.questions.find((item) => item.type === "route_choice" && item.scenario_id === question.scenario_id && question.scenario_id != null);
      const justification =
        group === "control" ? data?.cost_baseline_text : data?.explanation_text;
      const scenario =
        data?.map && data.start && data.goal && saved?.appearance
          ? {
              map: data.map,
              start: data.start,
              goal: data.goal,
              appearance: saved.appearance,
              terrain_colors: saved.terrain_colors,
              routes:
                data.optimal_path && data.alternative_path
                  ? [data.optimal_path, data.alternative_path]
                  : undefined,
              route_order: ["optimal", "alternative"] as ("optimal" | "alternative")[],
              modifications: group === "experimental" ? data.modifications : undefined,
              show_explanation_map: group === "experimental",
            }
          : undefined;
      return {
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        configuration: question.configuration,
        scenario,
        justification,
        preview_route_id: previewRoute?.id,
        confirmed_choice: null,
      };
    }),
  };
}

export function QuestionnaireAdmin({
  onBack,
  onOpenAbout,
  onCreateScenario,
  initialQuestionnaireId,
  initialScenarioId,
}: {
  onCreateScenario: (id: number, title: string) => void;
  initialQuestionnaireId: number | null;
  initialScenarioId: number | null;
  onBack: () => void;
  onOpenAbout: () => void;
}) {
  const [list, setList] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Questionnaire | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(initialQuestionnaireId === null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [initialForm, setInitialForm] = useState<Form>(emptyForm);
  const [preview, setPreview] = useState(false);
  const [previewGroup, setPreviewGroup] = useState<"control" | "experimental">(
    "control",
  );
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  const [exportKey, setExportKey] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activity, setActivity] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const detailsDirty =
    title !== (selected?.title ?? "") ||
    description !== (selected?.description ?? "");
  const questionDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const hasUnsavedChanges = detailsDirty || questionDirty;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);
  useEffect(() => {
    if (error && !selecting) errorRef.current?.focus();
  }, [error, selecting]);

  function confirmDiscard(dirty = hasUnsavedChanges) {
    return !dirty || window.confirm("Discard unsaved changes?");
  }
  function resetQuestion() {
    setEditing(null);
    setForm(emptyForm);
    setInitialForm(emptyForm);
  }

  const loadList = useCallback(
    async () => setList(await api<Summary[]>("/questionnaires")),
    [],
  );
  const loadQuestionnaire = useCallback(
    async (id: number, resetDetails = false) => {
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
      if (resetDetails) {
        setTitle(questionnaire.title);
        setDescription(questionnaire.description || "");
      }
      setScenarios(details);
      setSelectedScenario((previous) =>
        details.some((item) => item.id === previous)
          ? previous
          : details[0]?.id || null,
      );
    },
    [],
  );
  useEffect(() => {
    api<Summary[]>("/questionnaires")
      .then(setList)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  useEffect(() => {
    if (initialQuestionnaireId === null) return;
    Promise.resolve()
      .then(() => loadQuestionnaire(initialQuestionnaireId, true))
      .then(() => {
        if (initialScenarioId !== null) setSelectedScenario(initialScenarioId);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [initialQuestionnaireId, initialScenarioId, loadQuestionnaire]);
  async function perform(action: () => Promise<void>, message = "Working…") {
    setActivity(message);
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed.");
    } finally {
      setBusy(false);
      setActivity("");
    }
  }
  function select(id: number) {
    if (busy) return;
    if (id === selected?.id) {
      setSidebarOpen(false);
      sidebarToggleRef.current?.focus();
      return;
    }
    if (!confirmDiscard()) return;
    setSelecting(true);
    void perform(async () => {
      await loadQuestionnaire(id, true);
      setSidebarOpen(false);
      sidebarToggleRef.current?.focus();
      setExportKey("");
      setConfirmDelete(false);
      resetQuestion();
      setPreview(false);
    }).finally(() => setSelecting(false));
  }
  function newDraft() {
    if (busy) return;
    if (!confirmDiscard()) return;
    setExportKey("");
    setConfirmDelete(false);
    setSelected(null);
    setTitle("");
    setDescription("");
    setScenarios([]);
    resetQuestion();
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
      await loadQuestionnaire(item.id, true);
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
    if (editing === question.id) return;
    if (!confirmDiscard(questionDirty)) return;
    setEditing(question.id);
    const nextForm: Form = {
      prompt: question.prompt,
      type: question.type === "choice" ? "text" : question.type,
      scenarioId: question.scenario_id?.toString() || "",
    };
    setForm(nextForm);
    setInitialForm(nextForm);
  }
  function saveQuestion(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    void perform(async () => {
      const configuration: { min?: number; max?: number; max_length?: number } =
        {};
      if (form.type === "numeric") {
        configuration.min = 0;
        configuration.max = 100;
      } else if (form.type === "text") {
        configuration.max_length = 1000;
      } else if (form.type === "likert") {
        configuration.min = 1;
        configuration.max = 5;
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
      resetQuestion();
    });
  }
  function removeQuestion(id: number) {
    if (
      !selected ||
      (editing === id && !confirmDiscard(questionDirty)) ||
      !window.confirm("Delete this question?")
    )
      return;
    void perform(async () => {
      await api(`/questionnaires/${selected.id}/questions/${id}`, "DELETE");
      await loadQuestionnaire(selected.id);
      if (editing === id) {
        resetQuestion();
      }
    });
  }
  function handleConfirmDelete() {
    if (!selected) return;
    void perform(async () => {
      await api(`/questionnaires/${selected.id}`, "DELETE");
      setConfirmDelete(false);
      await loadList();
      newDraft();
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
  const currentScenario = scenarios.find(
    (item) => item.id === selectedScenario,
  );
  const editable = !selected || selected.status === "draft";
  const panelBusy = busy && !selecting;

  return (
    <>
      <Topbar
        view="admin"
        onBack={() => {
          if (confirmDiscard()) onBack();
        }}
        onOpenAbout={onOpenAbout}
      />
      <div className="qa-app">
        <div className={`qa-layout ${sidebarOpen ? "" : "qa-layout-collapsed"}`}>
        <aside className="qa-sidebar" id="questionnaire-sidebar">
        <button
          type="button"
          ref={sidebarToggleRef}
          className="qa-sidebar-toggle"
          aria-label={sidebarOpen ? "Hide questionnaires" : "Show questionnaires"}
          title={sidebarOpen ? "Hide questionnaires" : "Show questionnaires"}
          aria-expanded={sidebarOpen}
          aria-controls="questionnaire-sidebar"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <span aria-hidden="true">{sidebarOpen ? "‹" : "›"}</span>
        </button>
        <div className="qa-sidebar-content" inert={!sidebarOpen}>
          <div className="qa-side-header">
            <div className="qa-side-heading">
              <h2>Questionnaires</h2>
            </div>
            <p className="qa-sidebar-subtitle">Create and manage local drafts.</p>
          </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={newDraft}
                disabled={busy && !selecting}
                aria-disabled={busy}
                title="Create a new draft questionnaire"
              >
                <span>+</span> New
              </button>
          {list.length === 0 ? (
            <div className="qa-sidebar-empty-card">
              <p className="qa-empty-title">No questionnaires yet</p>
              <p className="qa-empty-desc">
                Click &ldquo;+ New&rdquo; above to start drafting your first study.
              </p>
            </div>
          ) : (
            <nav aria-label="Questionnaires" className="qa-nav-list">
              {list.map((item) => (
                <button
                  className={`qa-list-item ${selected?.id === item.id ? "is-active" : ""}`}
                  key={item.id}
                  onClick={() => select(item.id)}
                  disabled={busy && !selecting}
                  aria-disabled={busy}
                  type="button"
                >
                  <strong>{item.title}</strong>
                  <span>{item.status}</span>
                </button>
              ))}
            </nav>
          )}
        </div>
        </aside>
        <span className="qa-visually-hidden" role="status">
          {selecting ? "Loading questionnaire…" : ""}
        </span>
        <main className="qa-content" inert={selecting}>
          {error && (
            <div className="qa-error" role="alert" tabIndex={-1} ref={errorRef}>
              {error}
            </div>
          )}
          {busy && !selecting && (
            <p role="status" className="qa-notice">
              {activity}
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
                disabled={panelBusy}
                onClick={() => {
                  if (!confirmDiscard()) return;
                  if (
                    !window.confirm(
                      "Activate this questionnaire? It can no longer be edited.",
                    )
                  )
                    return;
                  setTitle(selected.title);
                  setDescription(selected.description || "");
                  resetQuestion();
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
            {selected?.status === "active" &&
              selected.access_token &&
              (participantLink(selected.access_token) ? (
                <label className="qa-form">
                  Participant link
                  <input
                    readOnly
                    value={participantLink(selected.access_token) || ""}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
              ) : (
                <p className="qa-notice">
                  Configure PUBLIC_PARTICIPANT_URL to create the participant
                  link.
                </p>
              ))}
            {selected?.status === "active" && (
              <button
                type="button"
                className="qa-secondary"
                disabled={panelBusy}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Close this questionnaire? New submissions will no longer be accepted.",
                    )
                  )
                    return;
                  void perform(async () => {
                    await api(`/questionnaires/${selected.id}/close`, "POST");
                    await loadList();
                    await loadQuestionnaire(selected.id);
                  });
                }}
              >
                Close questionnaire
              </button>
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
                    disabled={panelBusy}
                  />
                </label>
                <button type="submit" className="qa-secondary" disabled={panelBusy}>
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
                    maxLength={100}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={panelBusy || !editable}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={panelBusy || !editable}
                  />
                </label>
                <button disabled={panelBusy || !editable} type="submit">
                  {selected ? "Save details" : "Create draft"}
                </button>
              </form>
            )}
          </section>
          {selected && preview && (
            <section className="qa-panel qa-preview">
              <span className="qa-overline">PARTICIPANT PREVIEW</span>
              <label>
                Group
                <select
                  value={previewGroup}
                  onChange={(event) =>
                    setPreviewGroup(
                      event.target.value as "control" | "experimental",
                    )
                  }
                >
                  <option value="control">Control</option>
                  <option value="experimental">Experimental</option>
                </select>
              </label>
              <p className="qa-muted">This preview does not save answers.</p>
              <Participant
                key={`${selected.id}-${previewGroup}`}
                preview={buildPreview(selected, scenarios, previewGroup)}
              />
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
                          {displayLabels[q.type] || q.type}
                          {q.scenario_id ? ` · Scenario ${q.scenario_id}` : ""}
                        </small>
                      </div>
                      <div className="qa-actions">
                        <button
                          type="button"
                          aria-label={`Move question ${i + 1} up`}
                          disabled={panelBusy || !editable || i === 0}
                          onClick={() => moveQuestion(i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Move question ${i + 1} down`}
                          disabled={
                            panelBusy ||
                            !editable ||
                            i === selected.questions.length - 1
                          }
                          onClick={() => moveQuestion(i, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          disabled={panelBusy || !editable}
                          onClick={() => editQuestion(q)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={panelBusy || !editable}
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
                      disabled={panelBusy || !editable}
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
                      disabled={panelBusy || !editable}
                    />
                  </label>
                  {form.type === "text" && (
                    <p className="qa-muted">
                      Open response with a limit of 1000 characters.
                    </p>
                  )}
                  {form.type === "numeric" && (
                    <p className="qa-muted">
                      Fixed bounds: 0 to 100.
                    </p>
                  )}
                  {form.type === "likert" && (
                    <div className="qa-likert-info">
                      <p className="qa-muted">
                        Fixed 1 to 5 scale:
                      </p>
                      <ol className="qa-likert-labels">
                        <li>Strongly disagree</li>
                        <li>Somewhat disagree</li>
                        <li>Neither agree nor disagree</li>
                        <li>Somewhat agree</li>
                        <li>Strongly agree</li>
                      </ol>
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
                        disabled={panelBusy || !editable}
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
                    <button type="submit" disabled={panelBusy || !editable}>
                      {editing ? "Save question" : "Add question"}
                    </button>
                    {editing && (
                      <button
                        type="button"
                        className="qa-secondary"
                        onClick={() => {
                          if (!confirmDiscard(questionDirty)) return;
                          resetQuestion();
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
                <button type="button" disabled={panelBusy || !editable} onClick={() => {
                  if (selected && confirmDiscard()) onCreateScenario(selected.id, selected.title);
                }}>
                  Create scenario
                </button>
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
                      <ScenarioMap key={currentScenario.id} scenario={currentScenario} />
                    )}
                  </div>
                )}
              </section>
              <section className="qa-panel qa-danger-panel">
                <div className="qa-heading">
                  <div>
                    <span className="qa-overline">DANGER ZONE</span>
                    <h2>Delete questionnaire</h2>
                    <p className="qa-muted">
                      Permanently delete this questionnaire along with its questions and scenarios.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="qa-danger"
                    disabled={panelBusy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete questionnaire
                  </button>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
      {confirmDelete && selected && (
        <ConfirmModal
          title="Delete Questionnaire"
          description={
            <>
              The questionnaire <strong>&quot;{selected.title}&quot;</strong>{" "}
              currently contains{" "}
              <strong>{selected.questions.length} question(s)</strong>
              {scenarios.length > 0 && (
                <>
                  {" "}and <strong>{scenarios.length} scenario(s)</strong>
                </>
              )}
              .
            </>
          }
          warning="Continuing will permanently delete this questionnaire along with all its configured questions, scenarios, and generated routes."
          confirmLabel={busy ? "Deleting Questionnaire..." : "Continue & Delete"}
          busy={busy}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
  </>
);
}
