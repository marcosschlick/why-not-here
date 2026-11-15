import { useState } from "react";
import type { MapData, SystemConfig } from "../types";
import {
  configuredValidationScope,
  formatReductionMethod,
  formatValidationScope,
} from "../utils/formatters";
import { useI18n } from "../i18n";
import { LocalizedMapPreview } from "./LocalizedMapPreview";

interface SolverConfigBadgesProps {
  config?: SystemConfig | null;
  mapImageUrl?: string;
  mapData?: MapData | null;
  cacheKey: number;
  onSelectMap: (imageUrl: string) => void;
}

function SolverMapPreview({
  mapImageUrl,
  mapData,
  cacheKey,
  onSelectMap,
}: Required<Pick<SolverConfigBadgesProps, "mapImageUrl">> &
  Pick<SolverConfigBadgesProps, "cacheKey" | "onSelectMap" | "mapData">) {
  const { language, t } = useI18n();
  const [isLoaded, setIsLoaded] = useState(false);
  const fullUrl = mapImageUrl.includes("?")
    ? `${mapImageUrl}&t=${cacheKey}`
    : `${mapImageUrl}?t=${cacheKey}`;

  return (
    <div
      className="solver-map-preview"
      onClick={() => onSelectMap(mapImageUrl)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectMap(mapImageUrl);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={t("Open base map")}
    >
      <span className="solver-map-preview-label">{t("Base map")}</span>
      {language === "pt-BR" && mapData ? (
        <LocalizedMapPreview
          view={{ mapData }}
          className="solver-map-preview-canvas"
        />
      ) : (
        <img
          src={fullUrl}
          alt={t("Base map")}
          className={`solver-map-preview-image ${isLoaded ? "is-loaded" : ""}`}
          onLoad={() => setIsLoaded(true)}
        />
      )}
    </div>
  );
}

export function SolverConfigBadges({
  config,
  mapImageUrl,
  mapData,
  cacheKey,
  onSelectMap,
}: SolverConfigBadgesProps) {
  const { language, t, n } = useI18n();
  if (!config) return null;

  const reductionLabel = t(
    formatReductionMethod(config.DEFAULT_REDUCTION_METHOD),
  );

  const solverArchLabel = config.USE_INCREMENTAL_SOLVER
    ? t("Incremental MILP ({solver} · {scope})", {
        solver: config.DEFAULT_SOLVER || "HiGHS",
        scope: t(formatValidationScope(configuredValidationScope(config))),
      })
    : t("Monolithic MILP ({solver})", {
        solver: config.DEFAULT_SOLVER || "HiGHS",
      });

  const gridSpecs = t("{height}×{width} ({connectivity}-Connected)", {
    height: n(config.MAP_H),
    width: n(config.MAP_W),
    connectivity: n(config.CONNECTIVITY),
  });

  return (
    <section className={`solver-params-bar${mapImageUrl ? " has-map" : ""}`}>
      <div className="solver-params-details">
        <div className="solver-params-header">
          <span className="solver-params-title">{t("Run Parameters")}</span>
          <span className="solver-params-subtitle">
            {t("Active configuration for this run")}
          </span>
        </div>

        <div className="solver-params-grid">
          <div className="solver-param-chip">
            <span className="param-chip-label">{t("Scenario")}</span>
            <span className="param-chip-value">
              {config.ISP_MODEL === "BRANDAO"
                ? t("Brandao adaptation (1:8, no slope effects)")
                : t("Normal terrain and elevation")}
            </span>
          </div>
          <div className="solver-param-chip">
            <span className="param-chip-label">{t("Time Budget")}</span>
            <span className="param-chip-value">
              {n(config.ISP_TIME_BUDGET_SEC ?? 1800, 3)} s
            </span>
          </div>
          <div className="solver-param-chip">
            <span className="param-chip-label">{t("Graph Reduction")}</span>
            <span className="param-chip-value highlight-azure">
              {reductionLabel}
            </span>
          </div>

          <div className="solver-param-chip">
            <span className="param-chip-label">{t("Solver")}</span>
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
            <span className="param-chip-label">{t("Grid")}</span>
            <span className="param-chip-value">{gridSpecs}</span>
          </div>

          <div className="solver-param-chip">
            <span className="param-chip-label">{t("Seed")}</span>
            <span className="param-chip-value">
              #{n(config.MAP_DEFAULT_SEED ?? 42)}
            </span>
          </div>
        </div>
      </div>

      {mapImageUrl && (language !== "pt-BR" || mapData) && (
        <SolverMapPreview
          key={`${mapImageUrl}-${cacheKey}`}
          mapImageUrl={mapImageUrl}
          mapData={mapData}
          cacheKey={cacheKey}
          onSelectMap={onSelectMap}
        />
      )}
    </section>
  );
}
