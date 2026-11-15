import { useState } from "react";
import type { MapData, SemanticModificationsData } from "../types";
import type { GridPoint } from "../utils/geometry";
import { useMapCanvasFit } from "../utils/useMapCanvasFit";
import { TacticalMapCanvas } from "./TacticalMapCanvas";

export interface MapViewLayers {
  mapData: MapData;
  optimalPath?: GridPoint[];
  userPath?: GridPoint[];
  modifications?: SemanticModificationsData | null;
}

export function LocalizedMapPreview({
  view,
  className,
}: {
  view: MapViewLayers;
  className: string;
}) {
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);
  const cellSize = useMapCanvasFit(wrapper, view.mapData.h, view.mapData.w);

  return (
    <div ref={setWrapper} className={`localized-map-preview ${className}`}>
      <TacticalMapCanvas
        mapData={view.mapData}
        optimalPath={view.optimalPath}
        userPath={view.userPath}
        modifications={view.modifications}
        cellSize={cellSize}
      />
    </div>
  );
}
