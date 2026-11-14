import { useEffect, useState } from "react";
import { fetchMapProfiles, solveScenarioISP } from "../services/api";
import type { LastResult, MapData, MapProfile, SystemConfig } from "../types";
import { validateDrawingRoute } from "../utils/validateRoute";
import { RouteCanvas } from "./RouteCanvas";

type Candidate = {
  map: MapData;
  path: [number, number][];
  result?: LastResult;
};

type PreparationState = {
  configuration: SystemConfig | null;
  savedIds: number[];
  protocolComplete: boolean;
};

async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Request failed. Saved scenarios are preserved.",
    );
  }
  return data as T;
}

function routeError(candidate: Candidate) {
  const { map, path } = candidate;
  const error = validateDrawingRoute(
    path,
    map.start,
    map.goal,
    map.h,
    map.w,
    map.connectivity,
  );
  if (error) return error;
  return JSON.stringify(path) === JSON.stringify(map.optimal_path)
    ? "Draw an alternative route distinct from the system's optimal route."
    : null;
}

export function ScenarioPreparation({
  questionnaireId,
  initial,
  onBack,
  onDirtyChange,
  onBusyChange,
}: {
  questionnaireId: number;
  initial: PreparationState;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [profiles, setProfiles] = useState<MapProfile[]>([]);
  const [size, setSize] = useState(
    () =>
      `${initial.configuration?.MAP_H ?? 16}x${initial.configuration?.MAP_W ?? 32}`,
  );
  const [fixedSize, setFixedSize] = useState(Boolean(initial.configuration));
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [savedIds, setSavedIds] = useState(initial.savedIds);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [protocolSaved, setProtocolSaved] = useState(initial.protocolComplete);
  const [retryPending, setRetryPending] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchMapProfiles()
      .then((data) => {
        if (mounted) setProfiles(data);
      })
      .catch((reason: Error) => {
        if (mounted) setError(reason.message);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    onDirtyChange(candidates.length > 0);
    return () => onDirtyChange(false);
  }, [candidates.length, onDirtyChange]);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  async function fillPositions(current: Candidate[], saved: number) {
    const next = [...current];
    let failures = 0;
    let lastFailure = "";
    const [height, width] = size.split("x").map(Number);
    while (saved + next.length < 6 && failures < 6) {
      setMessage(
        `Generating map ${saved + next.length + 1} of 6. Monolithic ISP · No reduction.`,
      );
      try {
        const map = await request<MapData>(
          `/api/questionnaires/${questionnaireId}/scenario-maps`,
          { height, width },
        );
        setFixedSize(true);
        next.push({ map, path: [map.start] });
        setCandidates([...next]);
        failures = 0;
      } catch (reason) {
        failures += 1;
        lastFailure =
          reason instanceof Error ? reason.message : "Map generation failed.";
        setError(lastFailure);
      }
    }
    if (failures >= 6) {
      setError(
        `Preparation paused after six consecutive generation failures. ${lastFailure} Saved scenarios and the seed sequence are preserved. Continue to try the next seeds, or return to the questionnaire.`,
      );
    } else {
      setError("");
    }
    setMessage(
      `${saved} of 6 scenarios saved. ${next.length} maps require manual routes.`,
    );
    setActive(0);
    return next;
  }

  async function generate() {
    if (busy) return;
    setBusy(true);
    setFixedSize(true);
    setError("");
    try {
      await fillPositions(candidates, savedIds.length);
    } finally {
      setBusy(false);
    }
  }

  async function saveProtocol() {
    const response = await fetch(
      `/api/questionnaires/${questionnaireId}/protocol`,
      {
        method: "PUT",
      },
    );
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(
        typeof data?.detail === "string"
          ? data.detail
          : "Unable to save the protocol. Retry without solving again.",
      );
    }
    setProtocolSaved(true);
    setMessage(
      "All six successful scenarios and the study protocol are saved. Preview is available in the questionnaire.",
    );
  }

  async function solve() {
    if (busy) return;
    const invalid = candidates.findIndex(
      (candidate) => !candidate.result && routeError(candidate),
    );
    if (
      !candidates.length ||
      (!retryPending && savedIds.length + candidates.length !== 6) ||
      invalid >= 0
    ) {
      if (invalid >= 0) setActive(invalid);
      setError(
        invalid >= 0
          ? routeError(candidates[invalid])!
          : "Generate all remaining maps before solving.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setRetryPending(false);
    const pending = [...candidates];
    const saved = [...savedIds];
    const remaining: Candidate[] = [];
    try {
      for (let index = 0; index < pending.length; index++) {
        const candidate = pending[index];
        const { map, path } = candidate;
        setActive(index);
        setMessage(
          `Solving seed ${map.generation?.base_seed ?? map.config.MAP_DEFAULT_SEED}. ${saved.length} of 6 saved.`,
        );
        let result = candidate.result;
        if (!result) {
          try {
            const response = await solveScenarioISP(questionnaireId, map, path);
            if (response.result.success === false) continue;
            result = response.result;
          } catch (reason) {
            remaining.push(candidate, ...pending.slice(index + 1));
            setCandidates(remaining);
            setActive(0);
            setRetryPending(true);
            setMessage(
              "Resolution paused. Pending maps and routes are preserved.",
            );
            throw new Error(
              `${reason instanceof Error ? reason.message : "Unable to contact the API."} Retry the pending scenarios without redrawing their routes.`,
              { cause: reason },
            );
          }
        }
        const solved = { ...candidate, result };
        try {
          const scenario = await request<{ id: number }>(
            `/api/questionnaires/${questionnaireId}/scenarios`,
            {
              title: `Scenario ${saved.length + 1} · Seed ${map.config.MAP_DEFAULT_SEED}`,
              configuration: map.config,
              data: {
                ...result,
                map: map.grid,
                modified_map: result.modified_grid ?? null,
                start: map.start,
                goal: map.goal,
                optimal_path: result.original_optimal_path,
                alternative_path: path,
                requested_seed: map.config.MAP_DEFAULT_SEED,
                generation: map.generation,
              },
            },
          );
          saved.push(scenario.id);
          setSavedIds([...saved]);
        } catch (reason) {
          remaining.push(solved, ...pending.slice(index + 1));
          setCandidates(remaining);
          setActive(0);
          setRetryPending(true);
          throw new Error(
            `${reason instanceof Error ? reason.message : "Saving failed."} Retry to save this successful result without solving it again.`,
            { cause: reason },
          );
        }
      }
      setCandidates(remaining);
      if (saved.length === 6) await saveProtocol();
      else await fillPositions(remaining, saved.length);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Preparation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function retryProtocol() {
    setBusy(true);
    setError("");
    try {
      await saveProtocol();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Protocol saving failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const selected = candidates[active];
  const allReady =
    candidates.length > 0 &&
    (retryPending || savedIds.length + candidates.length === 6) &&
    candidates.every((candidate) => candidate.result || !routeError(candidate));
  const solveLabel = retryPending
    ? "Retry pending scenarios"
    : "Solve all pending scenarios";
  function nextMap() {
    if (!selected) return;
    const invalid = selected.result ? null : routeError(selected);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError("");
    if (active < candidates.length - 1) setActive(active + 1);
    else void solve();
  }

  return (
    <section className="qa-panel qa-preparation" aria-busy={busy}>
      <div className="qa-heading">
        <div>
          <span className="qa-overline">SCENARIO PREPARATION</span>
          <h2>Six successful scenarios</h2>
        </div>
        <button
          type="button"
          className="qa-secondary"
          onClick={onBack}
          disabled={busy}
        >
          Back to questionnaire
        </button>
      </div>
      <p>
        Generate six maps, draw each alternative route manually, then solve the
        batch. Failed scenarios are replaced using the next seed. Successful
        scenarios are saved immediately.
      </p>
      <p className="qa-muted">
        Seeds: 42, 84, 126… · Monolithic ISP · No reduction. Unresolved maps and
        drawings are temporary; you will be warned before leaving.
      </p>
      <div className="qa-form">
        <label>
          Grid size
          <select
            value={size}
            disabled={busy || fixedSize}
            onChange={(event) => setSize(event.target.value)}
          >
            {!profiles.some(
              (profile) => `${profile.height}x${profile.width}` === size,
            ) && <option value={size}>{size.replace("x", " × ")}</option>}
            {profiles.map((profile) => (
              <option
                key={`${profile.height}x${profile.width}`}
                value={`${profile.height}x${profile.width}`}
              >
                {profile.height} × {profile.width}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p role="status">
        {savedIds.length} / 6 successful scenarios saved. {message}
      </p>
      {error && (
        <p className="qa-error" role="alert">
          {error}
        </p>
      )}
      {savedIds.length + candidates.length < 6 && (
        <button type="button" onClick={() => void generate()} disabled={busy}>
          {busy
            ? "Generating…"
            : candidates.length || fixedSize
              ? "Generate remaining maps"
              : "Generate six maps"}
        </button>
      )}
      {selected && (
        <RouteCanvas
          manualOnly
          key={selected.map.config.MAP_DEFAULT_SEED}
          mapData={selected.map}
          userPath={selected.path}
          onPathChange={(path) =>
            setCandidates((previous) =>
              busy || selected.result
                ? previous
                : previous.map((candidate, index) =>
                    index === active ? { ...candidate, path } : candidate,
                  ),
            )
          }
          isSolving={busy || Boolean(selected.result)}
          onSolve={nextMap}
          onPrevMap={active > 0 ? () => setActive(active - 1) : undefined}
          solveButtonText={
            active < candidates.length - 1 ? "Save Route & Next Map →" : solveLabel
          }
          batchStepper={
            <div className="batch-stepper-bar">
              <div className="batch-stepper-label">
                <span className="batch-stepper-title">
                  Batch Route Setup - Map {active + 1} of {candidates.length}
                </span>
              </div>
              <div className="batch-steps-list">
                {candidates.map((candidate, index) => {
                  const ready = Boolean(candidate.result) || !routeError(candidate);
                  return (
                    <button
                      type="button"
                      key={candidate.map.config.MAP_DEFAULT_SEED}
                      className={`batch-step-btn ${index === active ? "active" : ""}`}
                      aria-pressed={index === active}
                      disabled={busy}
                      onClick={() => setActive(index)}
                    >
                      <span>Map {index + 1} · Seed {candidate.map.config.MAP_DEFAULT_SEED}</span>
                      <span className={`batch-step-status-pill ${ready ? "ready" : "pending"}`}>
                        {candidate.result ? "Ready to save" : ready ? "Ready" : "Pending"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          }
          busyButtonText={
            selected.result ? "Result awaiting save" : "Preparing scenarios…"
          }
        />
      )}
      {selected?.result && (
        <button
          type="button"
          onClick={() => void solve()}
          disabled={busy || !allReady}
        >
          {busy ? "Preparing scenarios…" : solveLabel}
        </button>
      )}
      {savedIds.length === 6 && !protocolSaved && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void retryProtocol()}
        >
          Retry study setup
        </button>
      )}
    </section>
  );
}
