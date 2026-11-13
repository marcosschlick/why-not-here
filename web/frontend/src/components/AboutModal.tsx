import { useEffect, useState } from "react";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const [isRendered, setIsRendered] = useState<boolean>(isOpen);
  const [isVisible, setIsVisible] = useState<boolean>(isOpen);

  useEffect(() => {
    let timer: number | undefined;
    let animFrame: number | undefined;

    if (isOpen) {
      setIsRendered(true);
      animFrame = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else if (isRendered) {
      setIsVisible(false);
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
          <div className="about-header-block">
            <h2 id="about-modal-title" className="about-paper-title">
              Why Not Here?
            </h2>
            <p className="about-paper-subtitle">
              Contrastive Explanations for 2D Grid Navigation via Inverse
              Shortest Path (ISP)
            </p>
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
          <div className="about-core-question-card">
            <div className="about-question-icon">?</div>
            <div className="about-question-content">
              <span className="about-question-lead">
                Core Contrastive Question
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
                <h3>Optimal Planning (A* / Dijkstra)</h3>
              </div>
              <p>
                Computes the least-cost path (
                <strong className="symbol-opt">p*</strong>) over 2D grids
                accounting for distance, terrain friction, elevation slope,
                robot speed, physical obstacles, and impassable biomes (water,
                dense forest).
              </p>
            </div>

            <div className="about-mechanic-card">
              <div className="mechanic-header">
                <span className="mechanic-num">2</span>
                <h3>Semantic ISP (MILP)</h3>
              </div>
              <p>
                Solves a Mixed-Integer Linear Program to find minimal
                interventions making{" "}
                <strong className="symbol-user">p&apos;</strong> optimal:
                terrain changes, obstacle removal, slope leveling, opening
                impassable terrain, and speed adjustments.
              </p>
            </div>

            <div className="about-mechanic-card">
              <div className="mechanic-header">
                <span className="mechanic-num">3</span>
                <h3>Scalability &amp; Certification</h3>
              </div>
              <p>
                Supports graph reduction (Bounding Box, Reachable Set, Path
                Only, Sparsified), incremental cutting-plane solving, and batch
                runs—distinguishing globally certified solutions from unverified
                candidates.
              </p>
            </div>

            <div className="about-mechanic-card">
              <div className="mechanic-header">
                <span className="mechanic-num">4</span>
                <h3>Human-Subjects Questionnaires</h3>
              </div>
              <p>
                Enables structured evaluation studies using saved simulation
                scenarios, combining explanation assessment and route prediction
                tasks for participants.
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
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
