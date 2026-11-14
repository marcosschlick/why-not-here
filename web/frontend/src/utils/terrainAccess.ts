import type { GridLayersData, SemanticModificationsData } from "../types";
import type { GridPoint } from "./geometry";

export function hasCellOpening(map: GridLayersData, point: GridPoint): boolean {
  return map.cell_openings.some(
    ({ cell }) => cell[0] === point[0] && cell[1] === point[1],
  );
}

export function interventionDescriptions(
  modifications: SemanticModificationsData | null | undefined,
  point: GridPoint,
): string[] {
  if (!modifications || modifications.model !== "NORMAL") return [];
  const matches = ([row, col]: GridPoint) =>
    row === point[0] && col === point[1];
  const label = (edge: [GridPoint, GridPoint]) =>
    `[${edge[0].join(", ")}] → [${edge[1].join(", ")}]`;
  const descriptions: string[] = [];
  for (const opening of modifications.cell_openings.filter(({ cell }) =>
    matches(cell),
  )) {
    const reasons = [
      opening.original_obstacle ? "physical obstacle" : "",
      opening.impassable_terrain
        ? `impassable ${opening.original_terrain.toLowerCase().replaceAll("_", " ")}`
        : "",
    ]
      .filter(Boolean)
      .join(" and ");
    descriptions.push(
      `Cell opened: ${reasons}; ${opening.opened_speed_mps} m/s before slope effects; one intervention.`,
    );
  }
  for (const record of modifications.slope_adjustments.filter(({ edge }) =>
    edge.some(matches),
  )) {
    descriptions.push(
      `Directed slope ${label(record.edge)}: ${record.original_slope_deg.toFixed(2)}° → ${record.effective_slope_deg}°; reverse edge unchanged.`,
    );
  }
  for (const [records, category] of [
    [
      modifications.environmental_speed_edges,
      "Environmental speed limit removed",
    ],
    [modifications.robot_capability_edges, "Hypothetical robot capability"],
  ] as const) {
    for (const record of records.filter(({ edge }) => edge.some(matches))) {
      descriptions.push(
        `${category} ${label(record.edge)}: effective ${record.target_speed_mps} m/s; eligibility reference ${record.reference_speed_mps.toPrecision(4)} m/s; cost = distance / speed.`,
      );
    }
  }
  return descriptions;
}
