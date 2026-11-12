import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

interface ConfirmModalProps {
  title: string;
  description: ReactNode;
  warning: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({
  title,
  description,
  warning,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const trigger = document.activeElement;
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (busy) dialogRef.current?.focus({ preventScroll: true });
  }, [busy]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      );
      if (!buttons?.length) {
        event.preventDefault();
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="modal-backdrop is-visible"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="confirm-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={busy}
          >
            &times;
          </button>
        </div>
        <p className="confirm-modal-desc">{description}</p>
        <div className="confirm-modal-warning">{warning}</div>
        <div className="confirm-modal-actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-vibrant"
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
