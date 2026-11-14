import type { GridLayersData, SemanticModificationsData } from "../types";
import type { GridPoint } from "./geometry";
import { formatNumber, translate } from "../i18n";
import type { Language } from "../i18n";

export function hasCellOpening(map: GridLayersData, point: GridPoint): boolean {
  return map.cell_openings.some(
    ({ cell }) => cell[0] === point[0] && cell[1] === point[1],
  );
}

export function interventionDescriptions(
  modifications: SemanticModificationsData | null | undefined,
  point: GridPoint,
  language: Language = "en",
): string[] {
  if (!modifications) return [];
  const matches = ([row, col]: GridPoint) =>
    row === point[0] && col === point[1];
  const label = (edge: [GridPoint, GridPoint]) =>
    `[${edge[0].map((value) => formatNumber(language, value)).join(", ")}] → [${edge[1].map((value) => formatNumber(language, value)).join(", ")}]`;
  const descriptions: string[] = [];
  for (const [, target] of modifications.terrain_assignments.filter(([cell]) =>
    matches(cell),
  )) {
    descriptions.push(
      translate(
        language,
        target === "GRASS" ? "Terrain: slow → fast" : "Terrain: fast → slow",
      ),
    );
  }
  for (const opening of modifications.cell_openings.filter(({ cell }) =>
    matches(cell),
  )) {
    const reasons = [
      opening.original_obstacle ? translate(language, "physical obstacle") : "",
      opening.impassable_terrain
        ? translate(language, "impassable {terrain}", {
            terrain:
              language === "pt-BR"
                ? translate(language, opening.original_terrain)
                : opening.original_terrain.toLowerCase().replaceAll("_", " "),
          })
        : "",
    ]
      .filter(Boolean)
      .join(translate(language, " and "));
    descriptions.push(
      translate(
        language,
        "Cell opened: {reasons}; {speed} m/s before slope effects; one intervention.",
        {
          reasons,
          speed: formatNumber(language, opening.opened_speed_mps, 4),
        },
      ),
    );
  }
  for (const record of modifications.slope_adjustments.filter(({ edge }) =>
    edge.some(matches),
  )) {
    descriptions.push(
      translate(
        language,
        "Directed slope {edge}: {original}° → {effective}°; reverse edge unchanged.",
        {
          edge: label(record.edge),
          original: new Intl.NumberFormat(language, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(record.original_slope_deg),
          effective: formatNumber(language, record.effective_slope_deg, 2),
        },
      ),
    );
  }
  for (const [records, category] of [
    [
      modifications.environmental_speed_edges,
      translate(language, "Environmental speed limit removed"),
    ],
    [
      modifications.robot_capability_edges,
      translate(language, "Hypothetical robot capability"),
    ],
  ] as const) {
    for (const record of records.filter(({ edge }) => edge.some(matches))) {
      descriptions.push(
        translate(
          language,
          "{category} {edge}: effective {speed} m/s; eligibility reference {reference} m/s; cost = distance / speed.",
          {
            category,
            edge: label(record.edge),
            speed: formatNumber(language, record.target_speed_mps, 4),
            reference:
              language === "pt-BR"
                ? formatNumber(
                    language,
                    Number(record.reference_speed_mps.toPrecision(4)),
                    4,
                  )
                : record.reference_speed_mps.toPrecision(4),
          },
        ),
      );
    }
  }
  return descriptions;
}
