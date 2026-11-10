import { formatReductionMethod } from "../utils/formatters";

interface BaseTopbarProps {
  onOpenAbout: () => void;
}

interface SimulationTopbarProps extends BaseTopbarProps {
  view?: "simulation";
  currentStep: "config" | "route_canvas" | "results";
  onSelectStep: (step: "config" | "route_canvas" | "results") => void;
  hasMapData: boolean;
  hasResults: boolean;
  activeReductionMethod?: string;
  isIncrementalActive?: boolean;
  onOpenAdmin: () => void;
  onBack?: never;
}

interface AdminTopbarProps extends BaseTopbarProps {
  view: "admin";
  onBack: () => void;
  currentStep?: never;
  onSelectStep?: never;
  hasMapData?: never;
  hasResults?: never;
  activeReductionMethod?: never;
  isIncrementalActive?: never;
  onOpenAdmin?: never;
}

export type TopbarProps = SimulationTopbarProps | AdminTopbarProps;

export function Topbar(props: TopbarProps) {
  const isAdmin = props.view === "admin";

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
        {isAdmin ? (
          <>
            <div
              className="topbar-context-chip"
              title="Questionnaire Administration"
            >
              <span className="context-chip-dot" />
              <span className="context-chip-label">Questionnaires</span>
            </div>

            <button
              type="button"
              className="btn-about"
              onClick={props.onBack}
              title="Back to simulation"
              aria-label="Back to simulation"
            >
              <span>Simulation</span>
            </button>
          </>
        ) : (
          <>
            {props.currentStep === "results" && props.activeReductionMethod && (
              <div className="topbar-context-chip" title="Active Graph Reduction">
                <span className="context-chip-dot" />
                <span className="context-chip-label">
                  {formatReductionMethod(props.activeReductionMethod)}
                  {props.isIncrementalActive ? " \u2022 Incremental" : ""}
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
                aria-selected={props.currentStep === "config"}
                className={`stepper-tab ${
                  props.currentStep === "config" ? "active" : ""
                } ${props.hasMapData ? "completed" : ""}`}
                onClick={() => props.onSelectStep("config")}
              >
                <span className="stepper-indicator">
                  {props.hasMapData ? "✓" : "1"}
                </span>
                <span className="stepper-label">Configuration</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={props.currentStep === "route_canvas"}
                className={`stepper-tab ${
                  props.currentStep === "route_canvas" ? "active" : ""
                } ${props.hasResults ? "completed" : ""}`}
                onClick={() =>
                  props.hasMapData && props.onSelectStep("route_canvas")
                }
                disabled={!props.hasMapData}
              >
                <span className="stepper-indicator">
                  {props.hasResults ? "✓" : "2"}
                </span>
                <span className="stepper-label">Route Definition</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={props.currentStep === "results"}
                className={`stepper-tab ${
                  props.currentStep === "results" ? "active" : ""
                }`}
                onClick={() => props.hasResults && props.onSelectStep("results")}
                disabled={!props.hasResults}
              >
                <span className="stepper-indicator">3</span>
                <span className="stepper-label">Results &amp; Metrics</span>
              </button>
            </nav>

            <button
              type="button"
              className="btn-about"
              onClick={props.onOpenAdmin}
            >
              Questionnaires
            </button>
          </>
        )}

        <button
          type="button"
          className="btn-about"
          onClick={props.onOpenAbout}
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
