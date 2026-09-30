import { useEffect, useState } from "react";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const [isRendered, setIsRendered] = useState<boolean>(isOpen);
  const [isVisible, setIsVisible] = useState<boolean>(isOpen);

  if (isOpen && !isRendered) {
    setIsRendered(true);
  }
  if (!isOpen && isVisible) {
    setIsVisible(false);
  }

  useEffect(() => {
    let timer: number | undefined;
    let animFrame: number | undefined;

    if (isOpen) {
      animFrame = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else if (isRendered) {
      timer = window.setTimeout(() => {
        setIsRendered(false);
      }, 160);
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (animFrame !== undefined) window.cancelAnimationFrame(animFrame);
    };
  }, [isOpen, isRendered]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isRendered) return null;

  return (
    <div
      className={`modal-backdrop ${isVisible ? "is-visible" : "is-closing"}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
    >
      <div
        className={`modal-content about-modal-content ${isVisible ? "is-visible" : "is-closing"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="about-modal-header">
          <div className="about-modal-badge-row">
            <span className="about-tag-pill">XAIP Research</span>
            <span className="about-tag-pill highlight">
              Inverse Optimization
            </span>
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <div className="about-modal-body">
          <div className="about-header-block">
            <h2 id="about-modal-title" className="about-paper-title">
              Why Not Here?
            </h2>
            <p className="about-paper-subtitle">
              Contrastive Explanations for 2D Grid Navigation via Inverse
              Shortest Path (ISP)
            </p>
          </div>

          <div className="about-core-question-card">
            <div className="about-question-icon">?</div>
            <div className="about-question-content">
              <span className="about-question-lead">
                Core Contrastive Question:
              </span>
              <p className="about-question-text">
                &ldquo;Why was the optimal route{" "}
                <strong className="symbol-opt">p*</strong> chosen instead of the
                user-expected alternative{" "}
                <strong className="symbol-user">p&apos;</strong>?&rdquo;
              </p>
            </div>
          </div>

          <div className="about-mechanics-grid">
            <div className="about-mechanic-card">
              <div className="mechanic-header">
                <span className="mechanic-num">1</span>
                <h3>Optimal Planning (A*)</h3>
              </div>
              <p>
                Computes the least-cost path (
                <strong className="symbol-opt">p*</strong>) considering
                distance, terrain traversal friction, elevation slope, and
                obstacle clearance penalties.
              </p>
            </div>

            <div className="about-mechanic-card">
              <div className="mechanic-header">
                <span className="mechanic-num accent-lobster">2</span>
                <h3>Inverse Optimization (ISP / MILP)</h3>
              </div>
              <p>
                Formulates a Mixed-Integer Linear Program (MILP) to identify
                minimal environmental modifications that would make the
                alternative route (
                <strong className="symbol-user">p&apos;</strong>) optimal.
              </p>
            </div>

            <div className="about-mechanic-card">
              <div className="mechanic-header">
                <span className="mechanic-num accent-navy">3</span>
                <h3>Scalability Strategies</h3>
              </div>
              <p>
                Leverages graph reduction (Bounding Box, Reachable Set) and
                incremental iterative cutting-plane solvers to ensure
                computational tractability on 2D grids.
              </p>
            </div>
          </div>

          <div className="about-meta-box">
            <span className="about-meta-label">Authors &amp; Affiliation</span>
            <span className="about-meta-value">
              Marcos da Silva Schlick, Abner Gilead Araujo Guedes, Victor
              Machado Alves &bull; IFSul (Sant&apos;Ana do Livramento, Brazil)
            </span>
          </div>
        </div>

        <div className="about-modal-footer">
          <div className="about-footer-content">
            <span className="about-footer-note">
              Why Not Here? &bull; Explainable Artificial Intelligence Planning
              (XAIP)
            </span>
            <a
              className="about-github-link"
              href="https://github.com/marcosschlick/why-not-here"
              target="_blank"
              rel="noreferrer"
            >
              GitHub Repository
            </a>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
