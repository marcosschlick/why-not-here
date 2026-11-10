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
  return (
    <div
      className="modal-backdrop is-visible"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="confirm-modal-card" onClick={(event) => event.stopPropagation()}>
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
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-vibrant" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
