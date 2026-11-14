# Color Palette

This document defines the official 5-color palette for the project.

---

## Colors

| Name             | Hex       | RGB                  | HSL                  | Role                                                                      |
| :--------------- | :-------- | :------------------- | :------------------- | :------------------------------------------------------------------------ |
| **Azure Blue**   | `#327DE1` | `rgb(50, 125, 225)`  | `hsl(214, 74%, 54%)` | Primary brand accent, primary CTA buttons, links, active states           |
| **Yale Blue**    | `#324B64` | `rgb(50, 75, 100)`   | `hsl(210, 33%, 29%)` | Headers, navigation bars, structural containers, secondary brand elements |
| **Lobster Pink** | `#DB5461` | `rgb(219, 84, 97)`   | `hsl(354, 65%, 59%)` | Highlights, badges, warnings, secondary accents                           |
| **Bright Snow**  | `#F8F8F8` | `rgb(248, 248, 248)` | `hsl(0, 0%, 97%)`    | Main background, card surfaces, canvas, light theme base                  |
| **Shadow Grey**  | `#282828` | `rgb(40, 40, 40)`    | `hsl(0, 0%, 16%)`    | Primary text, titles, dark borders, dark theme elements                   |

---

## Code Tokens

On tactical maps, use Azure Blue (`#327DE1`) for the optimal route and Bright
Snow (`#F8F8F8`) for the alternative route, with a Shadow Grey (`#282828`)
outline. Keep the alternative route's inner line 0.14 cell widths and its
outline 0.20 cell widths. In cells shared by both paths, offset the lines by
0.12 cell widths to opposite sides so both remain visible. These route colors
are specific to the tactical map and do not add tokens to the official
five-color palette.

For normal-model interventions, use Turquoise (`#00C9C7`) for cell openings,
Violet (`#A855F7`) for directed slope adjustments, Pink (`#FF3B8D`) for
removing environmental speed limits, and Lime (`#C6FF00`) for hypothetical
robot speed capability. Brandao keeps Pink (`#FF3B8D`) for terrain assignments;
its map colors, cell grouping, routes and endpoints are unchanged.

Draw cell changes as filled circles with radius 0.39 cells and a Shadow Grey
(`#282828`) edge 0.05 cells wide, without a halo. Group same-type cells
transitively when row and column offsets are both at most one, connecting their
centers with rounded capsules 0.78 cells wide and an outer edge 0.05 cells wide.
Preserve empty regions. One normal opening resolves obstacle, impassable terrain
or both and is counted once; original reasons remain in inspection and explanations.
There is no precedence projection or separate overlapping obstacle-opening marker.

Draw each directed slope adjustment as an individual rounded cross at the edge
midpoint: a 0.50-cell main stroke, a 0.30-cell perpendicular stroke, and a small
arrow tip pointing toward the destination. Arrow-tip wings extend 0.10 cells
backward and 0.07 cells sideways. Colored strokes are 0.07 cells wide, surrounded
by a 0.17-cell dark contour. Draw every outline before colored strokes. Slope
counts represent directed edges adjusted to their signed traversability limit,
not leveled terrain. Do not group edge symbols into capsules.

Draw environmental speed interventions as single arrows and hypothetical robot
capability interventions as double arrows. The shaft is 0.50 cells long, with
0.13-cell backward and 0.10-cell sideways arrowhead wings; the second tip is
0.20 cells behind the first. Use the same 0.07/0.17-cell colored/dark stroke
widths. Shift speed-arrow centers 0.46 cells to the left normal of the directed
edge in row/column screen coordinates, separating them from centered slope
crosses and from reverse-direction actions. Draw cell markers first, slope
crosses next, then speed arrows and endpoints. Use matching symbols in Web and
PNG legends. Inspection identifies directed endpoints and all coincident actions.
The prepared background remains visible beneath intervention overlays in both
Canvas and PNG; saved candidate maps carry the actual applied physical state.

These map-specific colors do not add tokens to the official five-color UI palette.

Preserve the start and goal as diamonds with their existing colors and a
0.4-cell radius.

### CSS Custom Properties

```css
:root {
  --azure-blue: #327de1;
  --yale-blue: #324b64;
  --lobster-pink: #db5461;
  --bright-snow: #f8f8f8;
  --shadow-grey: #282828;
  --map-start: #00b0ff;
  --map-start-edge: #003366;
  --map-goal: #ffd700;
  --map-goal-edge: #664400;
  --map-route: #f8f8f8;
  --map-route-outline: #282828;
  --map-optimal-route: #327de1;
  --map-change-terrain: #ff3b8d;
  --map-change-robot-capability: #c6ff00;
  --map-change-environmental-speed: #ff3b8d;
  --map-change-slope: #a855f7;
  --map-change-cell-opening: #00c9c7;
}
```

### SCSS Variables

```scss
$azure-blue: #327de1;
$yale-blue: #324b64;
$lobster-pink: #db5461;
$bright-snow: #f8f8f8;
$shadow-grey: #282828;
```


### Terrain textures and obstacles

The prepared Brandao map uses map-specific green (`#5A9E68`) for fast terrain,
Yale Blue (`#324B64`) for slow terrain, and Shadow Grey (`#282828`) for all
blocked cells. These three classes replace terrain textures and relief shading
in this view, including its generated tactical images. Route, intervention, and
endpoint symbols retain the rules above.

Dense forest uses map-specific `#234A32` and groups of three layered trees; ordinary forest keeps `#2F653A` and a single layered tree with a trunk. Terrain motifs use Shadow Grey with three deterministic variants selected by `(row + 2*column) % 3`. Grass has short tufts; grassland has spaced stems; dry vegetation has broken branches; sand has irregular dots and ripples; mud has flattened marks and grooves; rocks have irregular polygons with an inner face; water has parallel short waves; compacted soil has horizontal marks; unpaved tracks have interrupted paired ruts.

At cell sizes of at least 8 pixels, motifs use 24% opacity and a 0.045-cell stroke width. Below 8 pixels, overview motifs span blocks of `2**ceil(log2(16/cell_pixels))` cells, producing spacing from 16 to less than 32 pixels. A repeating 2×2 atlas uses the same coordinate-based variants, 16% opacity and a 0.045-tile stroke width. Patterns are anchored to the grid origin, clipped to the actual terrain and omitted on physical obstacles. Canvas caches small atlases independently of map dimensions; PNG uses a raster overlay sampled by terrain class. Both scales stay below routes, changes and endpoints.

Physical obstacles use 58% of the underlying terrain RGB values, followed by directional relief shading. A Bright Snow cross at 55% opacity and 0.06-cell width identifies a blocked cell. The neutral hatched obstacle legend represents the common symbol rather than one terrain color. These map-specific colors and textures do not change the five UI tokens or any route and endpoint geometry.

### Directional relief

Land uses soft-light illumination from the upper left (315° azimuth, 45° altitude), with a visual vertical exaggeration of 2. Strength is 0.80 for maps whose largest dimension is at most 128 cells and 0.45 for larger maps, including custom dimensions. This preserves the approved small-map appearance and softens larger landscapes. The backend resolves an independent appearance object per map, shared by Python rendering and API responses through the existing `appearance.relief` fields. Texture motifs, colors, opacity and both texture scales remain unchanged. Gradients use physical cell spacing. A horizontal surface preserves its base color. Blend intensity is centered on the illumination of a horizontal surface, with no contrast normalization across the map or viewport, so zooming cannot change the light direction or strength. Water retains its base `#0585E6` blue. Apply this shading below terrain textures, routes, changes and endpoints. The visual exaggeration does not change physical elevations, slopes or costs. Rendering requires the current appearance definitions; no altitude-based shading fallback is supported. Current imported maps use the same size-based appearance.
