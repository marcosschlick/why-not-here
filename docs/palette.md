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
leveled slopes, and Turquoise (`#00C9C7`) for traversable water. Draw cell
changes as filled circles with a 0.39-cell radius and a Shadow Grey (`#282828`)
edge 0.05 cells wide, with no halo. Group changes of the same cell-based type
transitively when both their row and column offsets are at most one. Connect
grouped marker centers with rounded capsules 0.78 cells wide and an outer edge
0.05 cells wide, preserving empty regions in the group's shape. Terrain,
obstacle, and water cell changes must not share coordinates; treat a shared
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
  --map-change-water: #00c9c7;
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
