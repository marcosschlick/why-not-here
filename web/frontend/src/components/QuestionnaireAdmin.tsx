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
import { QuestionnaireResultsPanel } from "./QuestionnaireResultsPanel";
import { ScenarioPreparation } from "./ScenarioPreparation";
import { STUDY_GROUPS, GROUP_LABELS } from "../utils/studyGroups";
import type { StudyGroup } from "../utils/studyGroups";
import { ScenarioMapView } from "./ScenarioMapView";
import { Topbar } from "./Topbar";
import type {
  SystemConfig,
  MapAppearance,
  MapData,
  SemanticModificationsData,
} from "../types";
import "./questionnaire-admin.css";

type Point = [number, number];
type Question = {
  id: number;
  prompt: string;
  type: "route_scenario" | "likert";
  scenario_id: number | null;
  position: number;
  configuration: {
    source_scale?: string;
    source_item_number?: number;
    topic?: string;
  };
};
type Questionnaire = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  questions: Question[];
  preparation_configuration: SystemConfig | null;
};
type ParticipationKey = { key: string; used: boolean };
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
function localParticipantLink(): string {
  return new URL("/questionnaire", window.location.origin).toString();
}

function publicParticipantLink(): string | null {
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
    return new URL("/questionnaire", url).toString();
  } catch {
    return null;
  }
}

function ParticipantLinkActions({
  title,
  url,
  disabled,
  onCopy,
}: {
  title: string;
  url: string;
  disabled: boolean;
  onCopy: (url: string) => void;
}) {
  return (
    <div className="qa-participant-link">
      <h3>{title}</h3>
      <div className="qa-actions">
        <button
          type="button"
          disabled={disabled}
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        >
          Open questionnaire
        </button>
        <button
          type="button"
          className="qa-secondary"
          disabled={disabled}
          onClick={() => onCopy(url)}
        >
          Copy link
        </button>
      </div>
    </div>
  );
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

function ParticipationKeysPanel({
  questionnaireId,
  disabled,
}: {
  questionnaireId: number;
  disabled: boolean;
}) {
  const [keys, setKeys] = useState<ParticipationKey[] | null>(null);
  const [operation, setOperation] = useState<
    "loading" | "generating" | "copying" | null
  >("loading");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [showGenerator, setShowGenerator] = useState(false);
  const [quantity, setQuantity] = useState(10);
  const [filter, setFilter] = useState<"available" | "used">("available");
  const [copiedKey, setCopiedKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const busy = disabled || operation !== null;
  const availableKeys = keys?.filter((item) => !item.used) ?? [];
  const visibleKeys =
    filter === "available"
      ? availableKeys
      : (keys?.filter((item) => item.used) ?? []);
  const path = `/questionnaires/${questionnaireId}/participation-keys`;

  useEffect(() => {
    let cancelled = false;
    api<ParticipationKey[]>(path)
      .then((data) => {
        if (!cancelled) setKeys(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load participation keys.",
          );
      })
      .finally(() => {
        if (!cancelled) setOperation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path, refreshVersion]);

  function resetFeedback() {
    setCopiedKey("");
    setMessage("");
    setError("");
  }

  function closeGenerator() {
    setShowGenerator(false);
    requestAnimationFrame(() =>
      generateButtonRef.current?.focus({ preventScroll: true }),
    );
  }

  async function generateKeys(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setOperation("generating");
    resetFeedback();
    try {
      const created = await api<ParticipationKey[]>(path, "POST", { quantity });
      setKeys((current) => [...created, ...(current ?? [])]);
      setFilter("available");
      setMessage(
        `${created.length} ${created.length === 1 ? "key" : "keys"} generated.`,
      );
      closeGenerator();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to generate participation keys.",
      );
    } finally {
      setOperation(null);
    }
  }

  async function copyKeys(items: ParticipationKey[]) {
    if (busy || items.length === 0) return;
    setOperation("copying");
    resetFeedback();
    try {
      await navigator.clipboard.writeText(
        items.map((item) => item.key).join("\n"),
      );
      if (items.length === 1) setCopiedKey(items[0].key);
      setMessage(
        items.length === 1
          ? "Key copied."
          : `${items.length} available keys copied.`,
      );
    } catch {
      setError(
        "Unable to copy participation keys. Allow clipboard access and try again.",
      );
    } finally {
      setOperation(null);
    }
  }

  return (
    <section
      className="qa-control-group qa-keys-panel"
      aria-label="Participation keys"
      aria-busy={operation !== null}
    >
      <div className="qa-heading">
        <h3>Participation keys</h3>
        <div className="qa-actions">
          <button
            type="button"
            className="qa-overview-action"
            ref={generateButtonRef}
            hidden={showGenerator}
            disabled={busy || keys === null}
            aria-expanded={showGenerator}
            aria-controls="participation-key-generator"
            onClick={() => {
              resetFeedback();
              setShowGenerator(true);
            }}
          >
            Generate keys
          </button>
          <button
            type="button"
            className="qa-secondary qa-overview-action"
            disabled={busy}
            onClick={() => {
              resetFeedback();
              setOperation("loading");
              setRefreshVersion((current) => current + 1);
            }}
          >
            Refresh
          </button>
        </div>
      </div>
      <p className="qa-muted">
        Give one key to each participant. Keys are consumed when participation
        starts.
      </p>
      <div id="participation-key-generator" hidden={!showGenerator}>
        {showGenerator && (
          <form className="qa-key-generator" onSubmit={generateKeys}>
            <label htmlFor="participation-key-quantity">
              Number of keys
              <input
                id="participation-key-quantity"
                type="number"
                required
                min={1}
                max={1000}
                step={1}
                autoFocus
                value={quantity}
                disabled={busy}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
            </label>
            <div className="qa-actions">
              <button
                type="submit"
                className="qa-overview-action"
                disabled={busy}
              >
                {operation === "generating" ? "Generating..." : "Generate"}
              </button>
              <button
                type="button"
                className="qa-secondary qa-overview-action"
                disabled={busy}
                onClick={() => {
                  resetFeedback();
                  closeGenerator();
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
      {keys !== null && (
        <>
          <div className="qa-key-toolbar">
            <div
              className="qa-actions"
              role="group"
              aria-label="Filter participation keys"
            >
              {(["available", "used"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className="qa-secondary qa-key-filter qa-overview-action"
                  aria-pressed={filter === value}
                  disabled={busy}
                  onClick={() => {
                    setFilter(value);
                    resetFeedback();
                  }}
                >
                  {value === "available" ? "Available" : "Used"} (
                  {value === "available"
                    ? availableKeys.length
                    : keys.length - availableKeys.length}
                  )
                </button>
              ))}
            </div>
            <button
              type="button"
              className="qa-secondary qa-key-bulk-copy"
              disabled={busy || availableKeys.length === 0}
              onClick={() => void copyKeys(availableKeys)}
            >
              Copy available keys
            </button>
          </div>
          {visibleKeys.length > 0 ? (
            <ul
              className="qa-key-list"
              aria-label={
                filter === "available"
                  ? "Available participation keys"
                  : "Used participation keys"
              }
              tabIndex={0}
            >
              {visibleKeys.map((item) => (
                <li key={item.key}>
                  <code>{item.key}</code>
                  {item.used ? (
                    <span className="qa-key-used">Used</span>
                  ) : (
                    <button
                      type="button"
                      className="qa-secondary qa-overview-action qa-key-copy"
                      disabled={busy}
                      aria-label={
                        copiedKey === item.key
                          ? "Key copied"
                          : `Copy key ${item.key}`
                      }
                      onClick={() => void copyKeys([item])}
                    >
                      {copiedKey === item.key ? "Copied" : "Copy"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="qa-key-empty">
              {keys.length === 0
                ? "No keys yet. Generate a batch to get started."
                : filter === "available"
                  ? "No available keys. Generate more to invite participants."
                  : "No keys have been used yet."}
            </p>
          )}
        </>
      )}
      <p className="qa-muted" role="status">
        {operation === "loading" ? "Loading participation keys..." : message}
      </p>
      {error && (
        <p className="qa-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
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
}: {
  currentStep: "config" | "route_canvas" | "results";
  hasMapData: boolean;
  hasResults: boolean;
  onSelectStep: (step: "config" | "route_canvas" | "results") => void;
  onOpenAbout: () => void;
}) {
  const [list, setList] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Questionnaire | null>(null);
  const publicLink =
    selected?.status === "active" ? publicParticipantLink() : null;
  const [copyStatus, setCopyStatus] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(true);
  const [selectorMotion, setSelectorMotion] = useState(false);
  const selectorToggleRef = useRef<HTMLButtonElement>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<number | null>(null);
  const [renamingScenario, setRenamingScenario] = useState<number | null>(null);
  const [scenarioName, setScenarioName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [view, setView] = useState<
    "overview" | "preview" | "scenarios" | "preparation"
  >("overview");
  const preview = view === "preview";
  const [previewSubmissionKey] = useState(() => crypto.randomUUID());
  const [previewGroup, setPreviewGroup] = useState<StudyGroup>("cost_based");
  const [preparationDirty, setPreparationDirty] = useState(false);
  const [preparationBusy, setPreparationBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
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
  const scenarioDirty =
    renamingScenario !== null &&
    scenarioName !==
      scenarios.find((scenario) => scenario.id === renamingScenario)?.title;
  const hasUnsavedChanges =
    detailsDirty ||
    scenarioDirty ||
    preparationDirty ||
    preparationBusy;

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
    if (preparationBusy) return;
    if (!dirty) {
      action();
      return;
    }
    setConfirmation({
      title: "Discard Unsaved Changes",
      description: preparationDirty
        ? "Unresolved maps and route drawings will be discarded. Successful scenarios, configuration and reserved seeds are saved."
        : "Discard unsaved changes?",
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
      if (resetDetails) {
        setView("overview");
        setTitle(questionnaire.title);
        setDescription(questionnaire.description || "");
        setRenamingScenario(null);
        setScenarioName("");
      }
      setScenarios(details);
      setSelectedScenario((previous) =>
        details.some((item) => item.id === previous) ? previous : null,
      );
    },
    [],
  );
  useEffect(() => {
    api<Summary[]>("/questionnaires")
      .then(setList)
      .catch((reason: Error) => setError(reason.message));
  }, []);
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
    setSelectorMotion(false);
    if (id === selected?.id) {
      setSelectorOpen(false);
      selectorToggleRef.current?.focus();
      return;
    }
    confirmDiscard(() => {
      setSelecting(true);
      void perform(async () => {
        await loadQuestionnaire(id, true);
        setSelectorOpen(false);
        selectorToggleRef.current?.focus();
        setCopyStatus("");
        setConfirmDelete(false);
      }).finally(() => setSelecting(false));
    });
  }
  function newDraft() {
    if (busy) return;
    confirmDiscard(() => {
      setCopyStatus("");
      setConfirmDelete(false);
      setSelected(null);
      setTitle("");
      setDescription("");
      setScenarios([]);
      setSelectedScenario(null);
      setRenamingScenario(null);
      setScenarioName("");
      setView("overview");
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
  async function copyParticipantLink(url: string) {
    setError("");
    setCopyStatus("");
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("Participant link copied.");
    } catch {
      setError(
        "Unable to copy the participant link. Allow clipboard access and try again.",
      );
    }
  }
  async function retryStudySetup() {
    if (!selected) return;
    await perform(async () => {
      await api(`/questionnaires/${selected.id}/protocol`, "PUT");
      await loadQuestionnaire(selected.id);
    }, "Saving study setup...");
  }
  function handleActivateQuestionnaire() {
    if (!selected) return;
    confirmDiscard(() => {
      setConfirmation({
        title: "Activate Questionnaire",
        description: "Activate this questionnaire? It can no longer be edited.",
        confirmLabel: "Activate Questionnaire",
        onConfirm: () => {
          setTitle(selected.title);
          setDescription(selected.description || "");
          void perform(async () => {
            await api(`/questionnaires/${selected.id}/activate`, "POST");
            setView("overview");
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
  const protocolComplete = selected?.questions.length === 20;

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
        <div className="qa-layout">
          <main className="qa-content">
            <section className={`qa-selector${selectorMotion ? " is-animated" : ""}`} aria-label="Questionnaires">
              <div className="qa-selector-bar">
                <button
                  type="button"
                  ref={selectorToggleRef}
                  className="qa-selector-toggle"
                  aria-expanded={selectorOpen}
                  aria-controls="questionnaire-list"
                  onClick={(event) => {
                    setSelectorMotion(event.detail > 0);
                    setSelectorOpen(!selectorOpen);
                  }}
                >
                  <span className="qa-selector-indicator" aria-hidden="true">▶</span>
                  <span className="qa-selector-label">
                    <span>Questionnaires</span>
                    <strong>{selected?.title || "New questionnaire"}</strong>
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={newDraft}
                  disabled={busy && !selecting}
                  aria-disabled={busy}
                >
                  + New
                </button>
              </div>
              <div id="questionnaire-list" className={`qa-selector-collapse${selectorOpen ? " is-open" : ""}`} inert={!selectorOpen} aria-hidden={!selectorOpen}>
              <div className="qa-selector-content">
                {list.length === 0 ? (
                  <div className="qa-selector-empty">
                    <p className="qa-empty-title">No questionnaires yet</p>
                    <p className="qa-empty-desc">Use + New to create your first study.</p>
                  </div>
                ) : (
                  <nav aria-label="Questionnaires" className="qa-nav-list">
                    {list.map((item) => (
                      <button
                        className={`qa-list-item ${selected?.id === item.id ? "is-active" : ""}`}
                        key={item.id}
                        aria-current={selected?.id === item.id ? "page" : undefined}
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
              </div>
            </section>
            <span className="qa-visually-hidden" role="status">
              {selecting ? "Loading questionnaire…" : ""}
            </span>
            <div className="qa-selection-content" inert={selecting}>
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
            {selected && view === "preparation" ? (
              <ScenarioPreparation
                key={selected.id}
                questionnaireId={selected.id}
                initial={{
                  configuration: selected.preparation_configuration,
                  savedIds: scenarios.map((scenario) => scenario.id),
                  protocolComplete: Boolean(protocolComplete),
                }}
                onDirtyChange={setPreparationDirty}
                onBusyChange={setPreparationBusy}
                onBack={() =>
                  confirmDiscard(() => {
                    void perform(() => loadQuestionnaire(selected.id, true));
                  })
                }
              />
            ) : (
              <>
                <section className="qa-panel qa-details-panel">
                  <div className="qa-heading">
                    <div>
                      <span className="qa-overline">
                        {selected
                          ? `${selected.status.toUpperCase()} / ${selected.id}`
                          : "NEW QUESTIONNAIRE"}
                      </span>
                      <h2>
                        {selected ? selected.title : "Start a questionnaire"}
                      </h2>
                      {!selected ? (
                        <p className="qa-muted">Give your study a clear title and description.</p>
                      ) : !editable && selected?.description ? (
                        <p className="qa-muted">{selected.description}</p>
                      ) : null}
                    </div>
                    <div className="qa-actions qa-overview-actions">
                      {selected && (!editable || preview) && (
                        <button
                          type="button"
                          disabled={
                            !preview && (hasUnsavedChanges || !protocolComplete)
                          }
                          onClick={() =>
                            setView(preview ? "overview" : "preview")
                          }
                          className="qa-secondary qa-overview-action"
                        >
                          {preview
                            ? editable
                              ? "Back to editor"
                              : "Back to overview"
                            : "Preview questionnaire"}
                        </button>
                      )}
                      {selected && !editable && (
                        <button
                          type="button"
                          className="qa-secondary qa-overview-action"
                          aria-expanded={view === "scenarios"}
                          aria-controls="questionnaire-scenarios"
                          disabled={panelBusy}
                          onClick={() =>
                            setView(
                              view === "scenarios" ? "overview" : "scenarios",
                            )
                          }
                        >
                          {view === "scenarios"
                            ? "Hide scenarios"
                            : "View scenarios"}{" "}
                          ({scenarios.length})
                        </button>
                      )}
                    </div>
                  </div>
                  {selected && !editable && (
                    <QuestionnaireResultsPanel
                      key={`${selected.id}:${selected.status}`}
                      questionnaireId={selected.id}
                    />
                  )}
                  {selected?.status === "active" && (
                    <section
                      className="qa-control-group"
                      aria-label="Participant access"
                    >
                      <ParticipantLinkActions
                        title="Local participation"
                        url={localParticipantLink()}
                        disabled={panelBusy}
                        onCopy={(url) => void copyParticipantLink(url)}
                      />
                      {publicLink && (
                        <ParticipantLinkActions
                          title="Public participation"
                          url={publicLink}
                          disabled={panelBusy}
                          onCopy={(url) => void copyParticipantLink(url)}
                        />
                      )}
                      <p className="qa-muted" role="status">
                        {copyStatus}
                      </p>
                    </section>
                  )}
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
                              setSelected((current) =>
                                current?.id === selected.id
                                  ? { ...current, status: "closed" }
                                  : current,
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
                  {editable && !preview && (
                    <details className="qa-edit-details" open={!selected || detailsDirty || undefined}>
                      <summary>{selected ? "Edit details" : "Questionnaire details"}</summary>
                    <form onSubmit={saveDraft} className="qa-form">
                      <label>
                        Title
                        <input
                          required
                          maxLength={100}
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          disabled={panelBusy}
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          rows={2}
                          maxLength={1000}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          disabled={panelBusy}
                        />
                      </label>
                      <button disabled={panelBusy} type="submit">
                        {selected ? "Save details" : "Create draft"}
                      </button>
                    </form>
                    </details>
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
                          setPreviewGroup(event.target.value as StudyGroup)
                        }
                      >
                        {STUDY_GROUPS.map((group) => (
                          <option key={group} value={group}>
                            {GROUP_LABELS[group]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="qa-muted">
                      This preview does not save answers.
                    </p>
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
                    {(editable || view === "scenarios") && (
                      <section
                        className="qa-panel"
                        id="questionnaire-scenarios"
                      >
                        <div className="qa-heading">
                          <div>
                            {editable && (
                              <span className="qa-overline">STEP 1 OF 2</span>
                            )}
                            <h2>
                              Study scenarios{" "}
                              <span className="qa-count">
                                {scenarios.length}
                              </span>
                            </h2>
                            {editable && (
                              <p className="qa-muted">
                                Prepare six maps and draw an alternative route for each.
                              </p>
                            )}
                          </div>
                        </div>
                        {editable && (
                          <p className="qa-muted" role="status">
                            {protocolComplete ? "Six scenarios are ready for the study." : `${scenarios.length} of 6 scenarios saved. Scenarios are linked automatically.`}
                          </p>
                        )}
                        {editable && scenarios.length === 6 && !protocolComplete && (
                          <button type="button" disabled={panelBusy} onClick={() => void retryStudySetup()}>
                            Retry study setup
                          </button>
                        )}
                        {editable && (
                          <button
                            type="button"
                            disabled={panelBusy}
                            onClick={() => {
                              if (selected)
                                confirmDiscard(() => setView("preparation"));
                            }}
                          >
                            {scenarios.length === 6
                              ? "Review preparation"
                              : "Prepare six scenarios"}
                          </button>
                        )}
                        {scenarios.length > 0 && (
                          <div className="qa-scenario-view">
                            <ul
                              className="qa-scenarios"
                              aria-label="Saved scenarios"
                            >
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
                                        aria-label={`${selectedScenario === scenario.id ? "Hide" : "View"} scenario ${scenario.title}`}
                                        onClick={() =>
                                          setSelectedScenario((previous) =>
                                            previous === scenario.id
                                              ? null
                                              : scenario.id,
                                          )
                                        }
                                        disabled={panelBusy}
                                      >
                                        {selectedScenario === scenario.id
                                          ? "Hide"
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
                                          disabled={
                                            panelBusy || !scenarioName.trim()
                                          }
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
                        {protocolComplete && (
                          <details className="qa-instrument-details">
                            <summary>
                              View the 14 adapted evaluation items
                            </summary>
                            <p>
                              Adapted route explanation questionnaire, selected
                              from ESS, SCS and xHIS. Responses range from 1
                              (Strongly disagree) to 5 (Strongly agree). This
                              custom instrument has not been validated.
                            </p>
                            <ol>
                              {selected.questions
                                .filter(
                                  (question) => question.type === "likert",
                                )
                                .map((question) => (
                                  <li key={question.id}>
                                    <strong>
                                      {question.configuration.source_scale}{" "}
                                      {
                                        question.configuration
                                          .source_item_number
                                      }
                                    </strong>{" "}
                                    · {question.configuration.topic}:{" "}
                                    {question.prompt}
                                  </li>
                                ))}
                            </ol>
                          </details>
                        )}
                      </section>
                    )}
                    {editable && (
                      <section className="qa-panel qa-review-panel">
                        <span className="qa-overline">STEP 2 OF 2</span>
                        <div className="qa-setup-heading"><h2>Review and activate</h2><span className="qa-setup-status">{protocolComplete && !hasUnsavedChanges ? "Ready" : "Not ready"}</span></div>
                        <p className="qa-muted" role="status">
                          {!protocolComplete ? "Prepare six successful scenarios to enable preview and activation." : hasUnsavedChanges ? "Save your changes before previewing or activating the questionnaire." : "Preview the study before activation. Activation locks editing."}
                        </p>
                        <div className="qa-actions">
                          <button type="button" className="qa-secondary" disabled={panelBusy || hasUnsavedChanges || !protocolComplete} onClick={() => setView("preview")}>Preview questionnaire</button>
                          <button type="button" disabled={panelBusy || hasUnsavedChanges || !protocolComplete} onClick={handleActivateQuestionnaire}>Activate questionnaire</button>
                        </div>
                      </section>
                    )}
                    {selected.status === "active" && (
                      <details className="qa-panel qa-access-details">
                        <summary>Participation keys</summary>
                        <ParticipationKeysPanel key={selected.id} questionnaireId={selected.id} disabled={panelBusy} />
                      </details>
                    )}
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
              </>
            )}
            </div>
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
