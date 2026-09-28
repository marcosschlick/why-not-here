import type { SystemConfig } from "../types";
import { formatReductionMethod, formatSolverType } from "../utils/formatters";

interface SolverConfigBadgesProps {
  config?: SystemConfig | null;
}

export function SolverConfigBadges({ config }: SolverConfigBadgesProps) {
  if (!config) return null;

  const reductionName = formatReductionMethod(config.DEFAULT_REDUCTION_METHOD);
  const solverName = formatSolverType(
    config.USE_INCREMENTAL_SOLVER,
    config.DEFAULT_SOLVER,
  );
  const gridSpecs = `${config.MAP_H}×${config.MAP_W} (${config.CONNECTIVITY}-Connected)`;

  return (
    <div className="solver-params-bar">
      <div className="solver-params-header">
        <span className="solver-params-title">
          Solver &amp; Graph Parameters
        </span>
        <span className="solver-params-subtitle">
          Active configuration applied to this optimization run
        </span>
      </div>

      <div className="solver-params-grid">
        <div className="solver-param-chip">
          <span className="param-chip-label">Graph Reduction</span>
          <span className="param-chip-value highlight-azure">
            {reductionName}
          </span>
        </div>

        <div className="solver-param-chip">
          <span className="param-chip-label">Optimization Architecture</span>
          <span
            className={`param-chip-value ${
              config.USE_INCREMENTAL_SOLVER
                ? "highlight-lobster"
                : "highlight-yale"
            }`}
          >
            {solverName}
          </span>
        </div>

        <div className="solver-param-chip">
          <span className="param-chip-label">Grid Resolution</span>
          <span className="param-chip-value">{gridSpecs}</span>
        </div>

        <div className="solver-param-chip">
          <span className="param-chip-label">Procedural Seed</span>
          <span className="param-chip-value">
            #{config.MAP_DEFAULT_SEED ?? 42}
          </span>
        </div>
      </div>
    </div>
  );
}
