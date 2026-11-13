export interface TopbarProps {
  activeView: "simulation" | "admin";
  currentStep: "config" | "route_canvas" | "results";
  onSelectStep: (step: "config" | "route_canvas" | "results") => void;
  hasMapData: boolean;
  hasResults: boolean;
  onOpenAdmin: () => void;
  onOpenAbout: () => void;
}

export function Topbar({
  activeView,
  currentStep,
  onSelectStep,
  hasMapData,
  hasResults,
  onOpenAdmin,
  onOpenAbout,
}: TopbarProps) {
  const isAdmin = activeView === "admin";

  return (
    <header className="app-topbar">
      <div className="topbar-brand">
        <h1 className="brand-logo-frame">
          <img
            src="/logo.svg"
            alt="Why Not Here?"
            className="brand-logo-img"
            width="1000"
            height="256"
          />
        </h1>

        <div className="brand-text">
          <span className="brand-tagline">
            Contrastive explanations for autonomous path planning via Inverse
            Shortest Path (ISP) on 2D grids
          </span>
        </div>
      </div>

      <div className="topbar-actions-group">
        <nav
          className="topbar-segmented-stepper"
          role="tablist"
          aria-label="Workflow Steps"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isAdmin && currentStep === "config"}
            className={`stepper-tab ${
              !isAdmin && currentStep === "config" ? "active" : ""
            } ${hasMapData ? "completed" : ""}`}
            onClick={() => onSelectStep("config")}
          >
            <span className="stepper-indicator">
              {hasMapData ? "✓" : "1"}
            </span>
            <span className="stepper-label">Configuration</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={!isAdmin && currentStep === "route_canvas"}
            className={`stepper-tab ${
              !isAdmin && currentStep === "route_canvas" ? "active" : ""
            } ${hasResults ? "completed" : ""}`}
            onClick={() => hasMapData && onSelectStep("route_canvas")}
            disabled={!hasMapData}
          >
            <span className="stepper-indicator">
              {hasResults ? "✓" : "2"}
            </span>
            <span className="stepper-label">Route Definition</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={!isAdmin && currentStep === "results"}
            className={`stepper-tab ${
              !isAdmin && currentStep === "results" ? "active" : ""
            }`}
            onClick={() => hasResults && onSelectStep("results")}
            disabled={!hasResults}
          >
            <span className="stepper-indicator">3</span>
            <span className="stepper-label">Results &amp; Metrics</span>
          </button>
        </nav>

        <button
          type="button"
          className={`btn-topbar-questionnaires ${isAdmin ? "active" : ""}`}
          aria-current={isAdmin ? "page" : undefined}
          onClick={() => {
            if (!isAdmin) onOpenAdmin();
          }}
        >
          <svg
            className="topbar-btn-icon"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="2.5" width="10" height="11.5" rx="1.5" />
            <path d="M5.5 6h5M5.5 9h5M5.5 12h3" />
          </svg>
          <span>Questionnaires</span>
        </button>

        <button
          type="button"
          className="btn-topbar-about"
          onClick={onOpenAbout}
          title="About the research and scientific principles"
          aria-label="About the research and scientific principles"
        >
          <span className="about-btn-icon" aria-hidden="true">
            ⓘ
          </span>
          <span>About</span>
        </button>
      </div>
    </header>
  );
}
