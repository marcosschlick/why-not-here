import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import { ConfirmModal } from "./ConfirmModal";
import type { ConfirmModalProps } from "./ConfirmModal";
import { Participant } from "./Participant";
import { ScenarioMapView } from "./ScenarioMapView";
import { Topbar } from "./Topbar";
import type {
  MapAppearance,
  MapData,
  SemanticModificationsData,
} from "../types";
import "./questionnaire-admin.css";

type Point = [number, number];
type Protocol = {
  explanation_scenario_ids: number[];
  prediction_scenario_ids: number[];
};
const emptyProtocol: Protocol = {
  explanation_scenario_ids: [],
  prediction_scenario_ids: [],
};
type Question = {
  id: number;
  prompt: string;
  type: "route_assessment" | "likert" | "route_prediction";
  scenario_id: number | null;
  position: number;
};
type Questionnaire = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  access_token?: string | null;
  questions: Question[];
  protocol: Protocol;
};
type Summary = Omit<Questionnaire, "questions" | "protocol">;
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

const ScenarioMap = memo(function ScenarioMap({
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
});

export function QuestionnaireAdmin({
  currentStep,
  hasMapData,
  hasResults,
  onSelectStep,
  onOpenAbout,
  onCreateScenario,
  initialQuestionnaireId,
  initialScenarioId,
}: {
  currentStep: "config" | "route_canvas" | "results";
  hasMapData: boolean;
  hasResults: boolean;
  onSelectStep: (step: "config" | "route_canvas" | "results") => void;
  onCreateScenario: (id: number, title: string) => void;
  initialQuestionnaireId: number | null;
  initialScenarioId: number | null;
  onOpenAbout: () => void;
}) {
  const [list, setList] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Questionnaire | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    initialQuestionnaireId === null,
  );
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<number | null>(null);
  const [renamingScenario, setRenamingScenario] = useState<number | null>(null);
  const [scenarioName, setScenarioName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [protocol, setProtocol] = useState<Protocol>(emptyProtocol);
  const [preview, setPreview] = useState(false);
  const [previewSubmissionKey] = useState(() => crypto.randomUUID());
  const [previewGroup, setPreviewGroup] = useState<"control" | "experimental">(
    "control",
  );
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  const [exportKey, setExportKey] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState<Pick<
    ConfirmModalProps,
    "title" | "description" | "confirmLabel" | "onConfirm"
  > | null>(null);
  const [activity, setActivity] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const restoreViewRef = useRef<{
    x: number;
    y: number;
    anchor?: HTMLElement;
    anchorTop?: number;
    focus: () => HTMLElement | null;
  } | null>(null);
  const detailsDirty =
    title !== (selected?.title ?? "") ||
    description !== (selected?.description ?? "");
  const protocolDirty =
    JSON.stringify(protocol) !==
    JSON.stringify(selected?.protocol ?? emptyProtocol);
  const scenarioDirty =
    renamingScenario !== null &&
    scenarioName !==
      scenarios.find((scenario) => scenario.id === renamingScenario)?.title;
  const hasUnsavedChanges = detailsDirty || protocolDirty || scenarioDirty;

  useLayoutEffect(() => {
    const restore = restoreViewRef.current;
    if (!restore || busy) return;
    restoreViewRef.current = null;
    const offset =
      restore.anchor && restore.anchorTop !== undefined
        ? restore.anchor.getBoundingClientRect().top - restore.anchorTop
        : 0;
    restore.focus()?.focus({ preventScroll: true });
    window.scrollTo({
      left: restore.x,
      top: restore.y + offset,
      behavior: "instant",
    });
  }, [selected, scenarios, busy, renamingScenario]);

  function rememberView(
    focus: () => HTMLElement | null,
    anchor?: HTMLElement | null,
  ) {
    restoreViewRef.current = {
      x: window.scrollX,
      y: window.scrollY,
      anchor: anchor ?? undefined,
      anchorTop: anchor?.getBoundingClientRect().top,
      focus,
    };
  }

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
    if (error && !selecting) {
      errorRef.current?.focus({ preventScroll: true });
    }
  }, [error, selecting]);

  function confirmDiscard(action: () => void, dirty = hasUnsavedChanges) {
    if (!dirty) {
      action();
      return;
    }
    setConfirmation({
      title: "Discard Unsaved Changes",
      description: "Discard unsaved changes?",
      confirmLabel: "Discard Changes",
      onConfirm: action,
    });
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
      setProtocol(questionnaire.protocol);
      if (resetDetails) {
        setTitle(questionnaire.title);
        setDescription(questionnaire.description || "");
        setRenamingScenario(null);
        setScenarioName("");
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
    if (busy) return;
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
    confirmDiscard(() => {
      setSelecting(true);
      void perform(async () => {
        await loadQuestionnaire(id, true);
        setSidebarOpen(false);
        sidebarToggleRef.current?.focus();
        setExportKey("");
        setConfirmDelete(false);
        setPreview(false);
      }).finally(() => setSelecting(false));
    });
  }
  function newDraft() {
    if (busy) return;
    confirmDiscard(() => {
      setExportKey("");
      setConfirmDelete(false);
      setSelected(null);
      setTitle("");
      setDescription("");
      setScenarios([]);
      setRenamingScenario(null);
      setScenarioName("");
      setProtocol(emptyProtocol);
      setPreview(false);
      setError("");
    });
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
  function saveProtocol(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    void perform(async () => {
      const saved = await api<Questionnaire>(
        `/questionnaires/${selected.id}/protocol`,
        "PUT",
        protocol,
      );
      setSelected(saved);
      setProtocol(saved.protocol);
    }, "Saving study protocol...");
  }
  function handleActivateQuestionnaire() {
    if (!selected) return;
    confirmDiscard(() => {
      setConfirmation({
        title: "Activate Questionnaire",
        description:
          "Activate this questionnaire? It can no longer be edited.",
        confirmLabel: "Activate Questionnaire",
        onConfirm: () => {
          setTitle(selected.title);
          setDescription(selected.description || "");
          setProtocol(selected.protocol);
          void perform(async () => {
            await api(`/questionnaires/${selected.id}/activate`, "POST");
            await loadList();
            await loadQuestionnaire(selected.id);
          });
        },
      });
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
  function renameScenario(event: FormEvent) {
    event.preventDefault();
    if (!selected || renamingScenario === null || busy) return;
    const id = renamingScenario;
    const row = event.currentTarget.closest("li");
    void perform(async () => {
      const saved = await api<{ id: number; title: string }>(
        `/questionnaires/${selected.id}/scenarios/${id}`,
        "PATCH",
        { title: scenarioName },
      );
      rememberView(
        () =>
          row?.querySelector<HTMLButtonElement>(".qa-rename-scenario") ?? null,
      );
      setScenarios((previous) =>
        previous.map((scenario) =>
          scenario.id === saved.id
            ? { ...scenario, title: saved.title }
            : scenario,
        ),
      );
      setRenamingScenario(null);
      setScenarioName("");
    }, "Renaming scenario…");
  }
  const currentScenario = scenarios.find(
    (item) => item.id === selectedScenario,
  );
  const editable = !selected || selected.status === "draft";
  const panelBusy = busy && !selecting;

  return (
    <>
      <Topbar
        activeView="admin"
        currentStep={currentStep}
        hasMapData={hasMapData}
        hasResults={hasResults}
        onSelectStep={(step) => confirmDiscard(() => onSelectStep(step))}
        onOpenAdmin={() => {}}
        onOpenAbout={onOpenAbout}
      />
      <div className="qa-app">
        <div
          className={`qa-layout ${sidebarOpen ? "" : "qa-layout-collapsed"}`}
        >
          <aside className="qa-sidebar" id="questionnaire-sidebar">
            <button
              type="button"
              ref={sidebarToggleRef}
              className="qa-sidebar-toggle"
              aria-label={
                sidebarOpen ? "Hide questionnaires" : "Show questionnaires"
              }
              title={
                sidebarOpen ? "Hide questionnaires" : "Show questionnaires"
              }
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
                <p className="qa-sidebar-subtitle">
                  Create and manage local drafts.
                </p>
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
                    Click &ldquo;+ New&rdquo; above to start drafting your first
                    study.
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
              <div
                className="qa-error"
                role="alert"
                tabIndex={-1}
                ref={errorRef}
              >
                {error}
              </div>
            )}
            <span role="status" className="qa-visually-hidden">
              {busy && !selecting ? activity : ""}
            </span>
            <section className="qa-panel">
              <div className="qa-heading">
                <div>
                  <span className="qa-overline">
                    {selected
                      ? `${selected.status.toUpperCase()} / ${selected.id}`
                      : "NEW QUESTIONNAIRE"}
                  </span>
                  <h2>
                    {selected
                      ? "Questionnaire details"
                      : "Start a questionnaire"}
                  </h2>
                  <p className="qa-muted">
                    Give your study a clear title and description.
                  </p>
                </div>
                {selected && (
                  <button
                    type="button"
                    disabled={
                      !preview &&
                      (hasUnsavedChanges || selected.questions.length !== 14)
                    }
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
                  disabled={panelBusy || selected.questions.length !== 14}
                  onClick={handleActivateQuestionnaire}
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
                  onClick={() =>
                    setConfirmation({
                      title: "Close Questionnaire",
                      description:
                        "Close this questionnaire? New submissions will no longer be accepted.",
                      confirmLabel: "Close Questionnaire",
                      onConfirm: () => {
                        void perform(async () => {
                          await api(
                            `/questionnaires/${selected.id}/close`,
                            "POST",
                          );
                          await loadList();
                          await loadQuestionnaire(selected.id);
                        });
                      },
                    })
                  }
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
                  <button
                    type="submit"
                    className="qa-secondary"
                    disabled={panelBusy}
                  >
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
                  preview={{
                    questionnaireId: selected.id,
                    group: previewGroup,
                    submissionKey: previewSubmissionKey,
                  }}
                />
              </section>
            )}
            {selected && !preview && (
              <>
                <section className="qa-panel" aria-busy={panelBusy}>
                  <h2>Study protocol</h2>
                  <p className="qa-muted">
                    Select six different saved scenarios. The system creates the
                    route decisions, explanations, eight adapted ESS items, and
                    predictions automatically.
                  </p>
                  <form
                    onSubmit={saveProtocol}
                    className="qa-form qa-protocol-form"
                  >
                    {(
                      [
                        "explanation_scenario_ids",
                        "prediction_scenario_ids",
                      ] as const
                    ).map((phase) => (
                      <fieldset
                        key={phase}
                        className="qa-fieldset"
                        disabled={panelBusy || !editable}
                      >
                        <legend>
                          {phase === "explanation_scenario_ids"
                            ? "Scenarios with explanations"
                            : "New scenarios for prediction"}
                        </legend>
                        <div className="qa-fields">
                          {[0, 1, 2].map((index) => (
                            <label key={index}>
                              Scenario {index + 1}
                              <select
                                required
                                value={protocol[phase][index] || ""}
                                onChange={(event) =>
                                  setProtocol((current) => {
                                    const ids = [...current[phase]];
                                    ids[index] = Number(event.target.value);
                                    return { ...current, [phase]: ids };
                                  })
                                }
                              >
                                <option value="">
                                  Select a saved scenario
                                </option>
                                {scenarios.map((scenario) => (
                                  <option
                                    key={scenario.id}
                                    value={scenario.id}
                                    disabled={
                                      scenario.id !== protocol[phase][index] &&
                                      [
                                        ...protocol.explanation_scenario_ids,
                                        ...protocol.prediction_scenario_ids,
                                      ].includes(scenario.id)
                                    }
                                  >
                                    {scenario.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                    <button type="submit" disabled={panelBusy || !editable}>
                      Save protocol
                    </button>
                  </form>
                  <p className="qa-muted" role="status">
                    {selected.questions.length === 14
                      ? "Protocol saved: 3 route assessments, 8 adapted ESS items, and 3 predictions."
                      : "Save all six scenarios to enable preview and activation."}
                  </p>
                  {protocolDirty && (
                    <p className="qa-notice">
                      Save the scenario selection before previewing or
                      activating the questionnaire.
                    </p>
                  )}
                  {selected.questions.length === 14 && (
                    <details className="qa-instrument-details">
                      <summary>View the eight adapted ESS items</summary>
                      <p>
                        Explanation Satisfaction Scale (ESS), adapted for route
                        planning. Hoffman et al., Appendix C. Responses range
                        from 1 (Strongly disagree) to 5 (Strongly agree).
                      </p>
                      <ol>
                        {selected.questions
                          .filter((question) => question.type === "likert")
                          .map((question) => (
                            <li key={question.id}>{question.prompt}</li>
                          ))}
                      </ol>
                    </details>
                  )}
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
                  <button
                    type="button"
                    disabled={panelBusy || !editable}
                    onClick={() => {
                      if (selected)
                        confirmDiscard(() =>
                          onCreateScenario(selected.id, selected.title),
                        );
                    }}
                  >
                    Create scenario
                  </button>
                  {scenarios.length > 0 && (
                    <div className="qa-scenario-view">
                      <ul className="qa-scenarios" aria-label="Saved scenarios">
                        {scenarios.map((scenario) => (
                          <li
                            key={scenario.id}
                            className={
                              selectedScenario === scenario.id
                                ? "is-active"
                                : ""
                            }
                          >
                            <div className="qa-scenario-row">
                              <strong>{scenario.title}</strong>
                              <div className="qa-actions">
                                <button
                                  type="button"
                                  className="qa-secondary"
                                  aria-pressed={
                                    selectedScenario === scenario.id
                                  }
                                  aria-label={`View scenario ${scenario.title}`}
                                  onClick={() =>
                                    setSelectedScenario(scenario.id)
                                  }
                                  disabled={panelBusy}
                                >
                                  {selectedScenario === scenario.id
                                    ? "Viewing"
                                    : "View"}
                                </button>
                                {editable && (
                                  <button
                                    type="button"
                                    className="qa-secondary qa-rename-scenario"
                                    disabled={
                                      panelBusy ||
                                      renamingScenario === scenario.id
                                    }
                                    aria-label={`Rename scenario ${scenario.title}`}
                                    onClick={() =>
                                      confirmDiscard(() => {
                                        setRenamingScenario(scenario.id);
                                        setScenarioName(scenario.title);
                                      }, scenarioDirty)
                                    }
                                  >
                                    Rename
                                  </button>
                                )}
                              </div>
                            </div>
                            {renamingScenario === scenario.id && (
                              <form
                                className="qa-form qa-scenario-rename"
                                onSubmit={renameScenario}
                              >
                                <label>
                                  Scenario name
                                  <input
                                    autoFocus
                                    required
                                    value={scenarioName}
                                    disabled={panelBusy}
                                    onChange={(event) =>
                                      setScenarioName(event.target.value)
                                    }
                                  />
                                </label>
                                <div className="qa-actions">
                                  <button
                                    type="submit"
                                    disabled={panelBusy || !scenarioName.trim()}
                                  >
                                    Save name
                                  </button>
                                  <button
                                    type="button"
                                    className="qa-secondary"
                                    disabled={panelBusy}
                                    onClick={(event) => {
                                      const row =
                                        event.currentTarget.closest("li");
                                      rememberView(
                                        () =>
                                          row?.querySelector<HTMLButtonElement>(
                                            ".qa-rename-scenario",
                                          ) ?? null,
                                      );
                                      setRenamingScenario(null);
                                      setScenarioName("");
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                      {currentScenario && (
                        <ScenarioMap
                          key={currentScenario.id}
                          scenario={currentScenario}
                        />
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
                        Permanently delete this questionnaire along with its
                        questions and scenarios.
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
      {confirmation && (
        <ConfirmModal
          key={confirmation.title}
          {...confirmation}
          busy={false}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            setConfirmation(null);
            confirmation.onConfirm();
          }}
        />
      )}
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
                  {" "}
                  and <strong>{scenarios.length} scenario(s)</strong>
                </>
              )}
              .
            </>
          }
          warning="Continuing will permanently delete this questionnaire along with all its configured questions, scenarios, and generated routes."
          confirmLabel={
            busy ? "Deleting Questionnaire..." : "Continue & Delete"
          }
          busy={busy}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}
