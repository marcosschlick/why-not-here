import { useEffect, useState } from "react";
import type { PointerEvent } from "react";
import type { MapData, SemanticModificationsData } from "../types";
import type { GridPoint } from "../utils/geometry";
import { useMapCanvasFit } from "../utils/useMapCanvasFit";
import { TacticalMapCanvas, TacticalMapLegend } from "./TacticalMapCanvas";

type ScenarioMapViewProps = {
  mapData: MapData;
  userPath?: GridPoint[];
  optimalPath?: GridPoint[];
  modifications?: SemanticModificationsData | null;
  alternativePathLabel?: string;
  onRendered?: () => void;
};

export function ScenarioMapView({
  mapData,
  userPath = [],
  optimalPath = [],
  modifications,
  alternativePathLabel,
  onRendered,
}: ScenarioMapViewProps) {
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hoveredCell, setHoveredCell] = useState<GridPoint | null>(null);
  const cellSize = useMapCanvasFit(wrapper, mapData.h, mapData.w);
  const maxZoom = Math.max(3, 24 / cellSize);
  const zoomLevel = Math.min(zoom, maxZoom);

  useEffect(() => {
    if (!wrapper) return;
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (event.deltaY < 0) setZoom((value) => Math.min(maxZoom, value * 2));
      if (event.deltaY > 0)
        setZoom((value) => Math.max(1, Math.min(maxZoom, value) / 2));
    }
    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", handleWheel);
  }, [wrapper, maxZoom]);

  function inspectCell(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x =
      event.clientX -
      rect.left +
      Number(event.currentTarget.dataset.offsetX ?? 0);
    const y =
      event.clientY -
      rect.top +
      Number(event.currentTarget.dataset.offsetY ?? 0);
    const col = Math.floor(x / zoomLevel / cellSize);
    const row = Math.floor(y / zoomLevel / cellSize);
    setHoveredCell(
      row >= 0 && row < mapData.h && col >= 0 && col < mapData.w
        ? [row, col]
        : null,
    );
  }

  return (
    <div className="scenario-map-view">
      <div className="scenario-map-controls">
        <div className="zoom-controls-bar" role="group" aria-label="Map zoom">
          <span className="zoom-label">Zoom</span>
          <button
            type="button"
            className="btn-zoom"
            onClick={() => setZoom(Math.max(1, zoomLevel / 2))}
            disabled={zoomLevel <= 1}
            aria-label="Zoom out"
          >
            &minus;
          </button>
          <span className="zoom-value">{Math.round(zoomLevel * 100)}%</span>
          <button
            type="button"
            className="btn-zoom"
            onClick={() => setZoom(Math.min(maxZoom, zoomLevel * 2))}
            disabled={zoomLevel >= maxZoom}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="btn-zoom btn-zoom-fit"
            onClick={() => setZoom(1)}
            disabled={zoomLevel === 1}
          >
            Fit
          </button>
        </div>
      </div>
      <div
        className="canvas-wrapper"
        ref={setWrapper}
        style={{ aspectRatio: `${mapData.w} / ${mapData.h}` }}
      >
        <TacticalMapCanvas
          mapData={mapData}
          userPath={userPath}
          optimalPath={optimalPath}
          modifications={modifications}
          cellSize={cellSize}
          zoomLevel={zoomLevel}
          hoveredCell={hoveredCell}
          onPointerMove={inspectCell}
          onPointerLeave={() => setHoveredCell(null)}
          onRendered={onRendered}
        />
      </div>
      <div className="canvas-footer-info">
        <div className="cell-inspector">
          {hoveredCell ? (
            <span>
              Cell [{hoveredCell[0]}, {hoveredCell[1]}] &bull; Terrain{" "}
              <strong>
                {mapData.terrain[hoveredCell[0]]?.[hoveredCell[1]]}
              </strong>{" "}
              &bull; Elevation{" "}
              <strong>
                {mapData.elevation[hoveredCell[0]]?.[hoveredCell[1]]?.toFixed(
                  1,
                )}{" "}
                m
              </strong>
            </span>
          ) : (
            "Hover over grid to inspect cell attributes"
          )}
        </div>
        <TacticalMapLegend
          mapData={mapData}
          modifications={modifications}
          showOptimalPath={optimalPath.length > 0}
          showAlternativePath={userPath.length > 0}
          alternativePathLabel={alternativePathLabel}
        />
      </div>
    </div>
  );
}
