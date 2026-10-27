import { useState } from "react";
import type { SystemConfig } from "../types";
import { formatReductionMethod } from "../utils/formatters";

interface SolverConfigBadgesProps {
  config?: SystemConfig | null;
  mapImageUrl?: string;
  cacheKey: number;
  onSelectMap: (imageUrl: string) => void;
}

function SolverMapPreview({
  mapImageUrl,
  cacheKey,
  onSelectMap,
}: Required<Pick<SolverConfigBadgesProps, "mapImageUrl">> &
  Pick<SolverConfigBadgesProps, "cacheKey" | "onSelectMap">) {
  const [isLoaded, setIsLoaded] = useState(false);
  const fullUrl = mapImageUrl.includes("?")
    ? `${mapImageUrl}&t=${cacheKey}`
    : `${mapImageUrl}?t=${cacheKey}`;

  return (
    <button
      type="button"
      className="solver-map-preview"
      onClick={() => onSelectMap(mapImageUrl)}
      aria-label="Open base map"
    >
      <span className="solver-map-preview-label">Base map</span>
      <img
        src={fullUrl}
        alt="Base map"
        className={`solver-map-preview-image ${isLoaded ? "is-loaded" : ""}`}
        onLoad={() => setIsLoaded(true)}
      />
    </button>
  );
}

export function SolverConfigBadges({
  config,
  mapImageUrl,
  cacheKey,
  onSelectMap,
}: SolverConfigBadgesProps) {
  if (!config) return null;

  const isBbox = config.DEFAULT_REDUCTION_METHOD === "BBOX";
  const reductionLabel = isBbox
    ? `${formatReductionMethod(config.DEFAULT_REDUCTION_METHOD)} (Margin: ${config.BBOX_MARGIN ?? 2})`
    : formatReductionMethod(config.DEFAULT_REDUCTION_METHOD);

  const hasReduction =
    config.DEFAULT_REDUCTION_METHOD &&
    config.DEFAULT_REDUCTION_METHOD !== "NONE";
  const astarScopeLabel =
    config.INCREMENTAL_ASTAR_SCOPE === "SUBGRAPH" ? "Subgraph A*" : "Global A*";

  const solverArchLabel = config.USE_INCREMENTAL_SOLVER
    ? `Incremental MILP (${config.DEFAULT_SOLVER || "HiGHS"}${
        hasReduction ? `, ${astarScopeLabel}` : ""
      }, Max Iter: ${config.MAX_ISP_ITERATIONS ?? 50})`
    : `Monolithic MILP (${config.DEFAULT_SOLVER || "HiGHS"})`;

  const gridSpecs = `${config.MAP_H}×${config.MAP_W} (${config.CONNECTIVITY}-Connected)`;

  return (
    <section className="solver-params-bar">
      <div className="solver-params-details">
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
              {reductionLabel}
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
              {solverArchLabel}
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

      {mapImageUrl && (
        <SolverMapPreview
          key={`${mapImageUrl}-${cacheKey}`}
          mapImageUrl={mapImageUrl}
          cacheKey={cacheKey}
          onSelectMap={onSelectMap}
        />
      )}
    </section>
  );
}
