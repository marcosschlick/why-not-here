import { useCallback, useEffect, useRef, useState } from "react";

export type RouteFields = {
  choice?: number | null;
  confidence?: number | null;
  reason?: string;
};

export type StepProgress = {
  value: RouteFields | number | null;
  visible_duration_ms: number;
  route_confirmed: boolean;
  first_selection_visible_duration_ms: number | null;
  final_selection_visible_duration_ms: number | null;
  decision_visible_duration_ms: number | null;
  choice_changed: boolean;
};

export class RequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new RequestError(
      typeof body?.detail === "string"
        ? body.detail
        : "Unable to load or save this step. Please try again.",
      response.status,
    );
  return body as T;
}

export function emptyProgress(kind: string): StepProgress {
  return {
    value: kind === "likert" ? null : {},
    visible_duration_ms: 0,
    route_confirmed: false,
    first_selection_visible_duration_ms: null,
    final_selection_visible_duration_ms: null,
    decision_visible_duration_ms: null,
    choice_changed: false,
  };
}

type ProgressOptions = {
  initial: StepProgress;
  initialRevision: number;
  token: string;
  submissionKey: string;
  stepIndex: number;
  preview: boolean;
};

export function useParticipationProgress({
  initial,
  initialRevision,
  token,
  submissionKey,
  stepIndex,
  preview,
}: ProgressOptions) {
  const storageKey = `participation-progress:${submissionKey}:${stepIndex}`;
  const [progress, setProgress] = useState(() => {
    if (!preview) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        if (
          cached?.revision === initialRevision &&
          cached.progress?.visible_duration_ms >= initial.visible_duration_ms
        )
          return cached.progress as StepProgress;
      } catch {
        return initial;
      }
    }
    return initial;
  });
  const current = useRef(progress);
  const revision = useRef(initialRevision);
  const pending = useRef<{ revision: number; progress: StepProgress } | null>(
    null,
  );
  const inFlight = useRef<Promise<void> | null>(null);
  const timeout = useRef<number | undefined>(undefined);
  const started = useRef<number | null>(null);
  const accumulated = useRef(progress.visible_duration_ms);
  const ready = useRef(false);
  const paused = useRef(false);
  const blocked = useRef(false);
  const mounted = useRef(true);
  const lastSaved = useRef(JSON.stringify(initial));
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(
    preview || JSON.stringify(initial) === JSON.stringify(progress),
  );
  const [isReady, setIsReady] = useState(false);

  const cache = useCallback(() => {
    if (preview || blocked.current) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          revision: revision.current,
          progress: current.current,
        }),
      );
    } catch {
      return;
    }
  }, [preview, storageKey]);

  const snapshot = useCallback(() => {
    if (started.current !== null) {
      const now = performance.now();
      accumulated.current += now - started.current;
      started.current = now;
    }
    current.current = {
      ...current.current,
      visible_duration_ms: Math.round(accumulated.current),
    };
    cache();
    return current.current;
  }, [cache]);

  const pause = useCallback(() => {
    snapshot();
    started.current = null;
    paused.current = true;
  }, [snapshot]);

  const resume = useCallback(() => {
    paused.current = false;
    if (
      ready.current &&
      !blocked.current &&
      document.visibilityState === "visible" &&
      started.current === null
    )
      started.current = performance.now();
  }, []);

  const markReady = useCallback(() => {
    if (ready.current) return;
    ready.current = true;
    setIsReady(true);
    if (!paused.current) resume();
  }, [resume]);

  const flush = useCallback(
    async (keepalive = false) => {
      window.clearTimeout(timeout.current);
      while (inFlight.current) await inFlight.current;
      if (blocked.current)
        throw new Error("Reload this questionnaire before continuing.");
      if (preview) return;
      const send = async (item: {
        revision: number;
        progress: StepProgress;
      }) => {
        pending.current = item;
        const response = await fetch(
          `/api/participate/${encodeURIComponent(token)}/steps/${stepIndex}/draft`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submission_key: submissionKey, ...item }),
            keepalive,
            signal: AbortSignal.timeout(10000),
          },
        );
        const result = await readResponse<{ draft_revision: number }>(response);
        revision.current = result.draft_revision;
        lastSaved.current = JSON.stringify(item.progress);
        pending.current = null;
        cache();
      };
      const task = (async () => {
        if (pending.current) await send(pending.current);
        const next = snapshot();
        if (JSON.stringify(next) !== lastSaved.current)
          await send({ revision: revision.current, progress: next });
        if (mounted.current) {
          setSaveError("");
          setSaved(JSON.stringify(current.current) === lastSaved.current);
        }
      })();
      inFlight.current = task;
      try {
        await task;
      } catch (failure) {
        if (
          failure instanceof RequestError &&
          [401, 409, 410].includes(failure.status)
        ) {
          blocked.current = true;
          started.current = null;
          if (mounted.current) setConflict(true);
        }
        if (mounted.current) {
          setSaved(false);
          setSaveError(
            failure instanceof Error
              ? failure.message
              : "Unable to save progress. Please try again.",
          );
        }
        throw failure;
      } finally {
        inFlight.current = null;
      }
    },
    [cache, preview, snapshot, stepIndex, submissionKey, token],
  );

  const scheduleSave = useCallback(() => {
    if (preview || blocked.current) return;
    window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => {
      void flush().catch(() => undefined);
    }, 500);
  }, [flush, preview]);

  const update = useCallback(
    (patch: Partial<StepProgress>) => {
      current.current = { ...snapshot(), ...patch };
      cache();
      setProgress(current.current);
      setSaved(preview);
      scheduleSave();
    },
    [cache, preview, scheduleSave, snapshot],
  );

  const choose = useCallback(
    (choice: number) => {
      const next = snapshot();
      const fields = next.value as RouteFields;
      if (next.route_confirmed || fields.choice === choice) return;
      update({
        value: { ...fields, choice },
        first_selection_visible_duration_ms:
          next.first_selection_visible_duration_ms ?? next.visible_duration_ms,
        final_selection_visible_duration_ms: next.visible_duration_ms,
        choice_changed: next.choice_changed || fields.choice != null,
      });
    },
    [snapshot, update],
  );

  useEffect(() => {
    mounted.current = true;
    const checkpoint = (keepalive = false) => {
      snapshot();
      if (!preview && !inFlight.current && !blocked.current)
        void flush(keepalive).catch(() => undefined);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        snapshot();
        started.current = null;
        checkpoint(true);
      } else if (!paused.current) resume();
    };
    const leave = () => {
      snapshot();
      started.current = null;
      checkpoint(true);
    };
    const enter = () => {
      if (!paused.current) resume();
    };
    const online = () => checkpoint();
    const interval = window.setInterval(() => {
      if (started.current !== null) checkpoint();
    }, 1000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", enter);
    window.addEventListener("online", online);
    return () => {
      mounted.current = false;
      snapshot();
      started.current = null;
      window.clearInterval(interval);
      window.clearTimeout(timeout.current);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", enter);
      window.removeEventListener("online", online);
    };
  }, [flush, preview, resume, snapshot]);

  function clear() {
    blocked.current = true;
    window.clearTimeout(timeout.current);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      return;
    }
  }

  return {
    progress,
    snapshot,
    update,
    choose,
    pause,
    resume,
    markReady,
    isReady,
    flush,
    revision,
    clear,
    saved,
    saveError,
    conflict,
  };
}
