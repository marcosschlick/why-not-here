import { formatReductionMethod } from "../utils/formatters";

interface TopbarProps {
  currentStep: "config" | "route_canvas" | "results";
  onSelectStep: (step: "config" | "route_canvas" | "results") => void;
  hasMapData: boolean;
  hasResults: boolean;
  activeReductionMethod?: string;
  isIncrementalActive?: boolean;
  onOpenAbout: () => void;
}

export function Topbar({
  currentStep,
  onSelectStep,
  hasMapData,
  hasResults,
  activeReductionMethod,
  isIncrementalActive,
  onOpenAbout,
}: TopbarProps) {
  const isStep1Done = hasMapData;
  const isStep2Done = hasResults;

  return (
    <header className="app-topbar">
      <div className="topbar-brand">
        <div className="brand-logo-frame" aria-label="Why Not Here Logo">
          <img
            src="/logo.svg"
            alt="Why Not Here Logo"
            className="brand-logo-img"
            width="38"
            height="38"
          />
        </div>

        <div className="brand-text">
          <h1>Why Not Here?</h1>
          <span className="brand-tagline">
            Contrastive explanations for autonomous path planning via Inverse
            Shortest Path (ISP) on 2D grids
          </span>
        </div>
      </div>

      <div className="topbar-actions-group">
        {currentStep === "results" && activeReductionMethod && (
          <div className="topbar-context-chip" title="Active Graph Reduction">
            <span className="context-chip-dot" />
            <span className="context-chip-label">
              {formatReductionMethod(activeReductionMethod)}
              {isIncrementalActive ? " \u2022 Incremental" : ""}
            </span>
          </div>
        )}

        <nav
          className="topbar-segmented-stepper"
          role="tablist"
          aria-label="Workflow Steps"
        >
          <button
            type="button"
            role="tab"
            aria-selected={currentStep === "config"}
            className={`stepper-tab ${currentStep === "config" ? "active" : ""} ${
              isStep1Done ? "completed" : ""
            }`}
            onClick={() => onSelectStep("config")}
          >
            <span className="stepper-indicator">{isStep1Done ? "✓" : "1"}</span>
            <span className="stepper-label">Configuration</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={currentStep === "route_canvas"}
            className={`stepper-tab ${
              currentStep === "route_canvas" ? "active" : ""
            } ${isStep2Done ? "completed" : ""}`}
            onClick={() => hasMapData && onSelectStep("route_canvas")}
            disabled={!hasMapData}
          >
            <span className="stepper-indicator">{isStep2Done ? "✓" : "2"}</span>
            <span className="stepper-label">Route Definition</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={currentStep === "results"}
            className={`stepper-tab ${currentStep === "results" ? "active" : ""}`}
            onClick={() => hasResults && onSelectStep("results")}
            disabled={!hasResults}
          >
            <span className="stepper-indicator">3</span>
            <span className="stepper-label">Results &amp; Metrics</span>
          </button>
        </nav>

        <button
          type="button"
          className="btn-about"
          onClick={onOpenAbout}
          title="About the research and scientific principles"
          aria-label="About the research and scientific principles"
        >
          <span className="about-btn-icon">ⓘ</span>
          <span>About</span>
        </button>
      </div>
    </header>
  );
}
