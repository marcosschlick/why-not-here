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

For semantic map changes, use map-specific colors: Pink (`#FF3B8D`) for changed
terrain, Lime (`#C6FF00`) for removed obstacles, Violet (`#A855F7`) for
leveled slopes, and Turquoise (`#00C9C7`) for opened impassable terrain (water or dense forest). Draw cell
changes as filled circles with a 0.39-cell radius and a Shadow Grey (`#282828`)
edge 0.05 cells wide, with no halo. Group changes of the same cell-based type
transitively when both their row and column offsets are at most one. Connect
grouped marker centers with rounded capsules 0.78 cells wide and an outer edge
0.05 cells wide, preserving empty regions in the group's shape. Terrain,
obstacle, and opened-terrain cell changes must not share coordinates; treat a shared
coordinate as invalid semantic data.

Draw each leveled slope edge as an individual rounded cross, centered at the
edge midpoint. Align its 0.50-cell main stroke with the edge and its
0.30-cell perpendicular stroke across the midpoint. Use a colored width of
0.07 cells and a Shadow Grey outer width 0.10 cells wider than each colored
stroke. Draw both dark outlines before both violet strokes so the contour
stays around the cross without crossing its violet center. Do not group slope
edges by proximity or join consecutive edges into capsules. Draw slope crosses
after cell changes so they remain visible over cell markers. Use circles for
cell changes and a cross for slope changes in map legends; slope counts
represent leveled edges.
These colors are specific to the tactical map and do not add tokens to the
official palette.

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
  --map-change-obstacle: #c6ff00;
  --map-change-slope: #a855f7;
  --map-change-opened-terrain: #00c9c7;
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

Dense forest uses map-specific `#234A32` and groups of three layered trees; ordinary forest keeps `#2F653A` and a single layered tree with a trunk. Terrain motifs use Shadow Grey with three deterministic variants selected by `(row + 2*column) % 3`. Grass has short tufts; grassland has spaced stems; dry vegetation has broken branches; sand has irregular dots and ripples; mud has flattened marks and grooves; rocks have irregular polygons with an inner face; water has parallel short waves; compacted soil has horizontal marks; unpaved tracks have interrupted paired ruts.

At cell sizes of at least 8 pixels, motifs use 24% opacity and a 0.045-cell stroke width. Below 8 pixels, overview motifs span blocks of `2**ceil(log2(16/cell_pixels))` cells, producing spacing from 16 to less than 32 pixels. A repeating 2×2 atlas uses the same coordinate-based variants, 16% opacity and a 0.045-tile stroke width. Patterns are anchored to the grid origin, clipped to the actual terrain and omitted on physical obstacles. Canvas caches small atlases independently of map dimensions; PNG uses a raster overlay sampled by terrain class. Both scales stay below routes, changes and endpoints.

Physical obstacles use 58% of the underlying terrain RGB values, followed by directional relief shading. A Bright Snow cross at 55% opacity and 0.06-cell width identifies a blocked cell. The neutral hatched obstacle legend represents the common symbol rather than one terrain color. These map-specific colors and textures do not change the five UI tokens or any route and endpoint geometry.

### Directional relief

Land uses soft-light illumination from the upper left (315° azimuth, 45° altitude), with a visual vertical exaggeration of 2. Strength is 0.80 for maps whose largest dimension is at most 128 cells and 0.45 for larger maps, including custom dimensions. This preserves the approved small-map appearance and softens larger landscapes. The backend resolves an independent appearance object per map, shared by Python rendering and API responses through the existing `appearance.relief` fields. Texture motifs, colors, opacity and both texture scales remain unchanged. Gradients use physical cell spacing. A horizontal surface preserves its base color. Blend intensity is centered on the illumination of a horizontal surface, with no contrast normalization across the map or viewport, so zooming cannot change the light direction or strength. Water retains its base `#0585E6` blue. Apply this shading below terrain textures, routes, changes and endpoints. The visual exaggeration does not change physical elevations, slopes or costs. Rendering requires the current appearance definitions; no altitude-based shading fallback is supported. Current imported maps use the same size-based appearance.
