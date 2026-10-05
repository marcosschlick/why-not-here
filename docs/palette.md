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

For semantic map changes, use map-specific colors: Pink (`#CC79A7`) for changed
terrain, Orange (`#E69F00`) for removed obstacles, Teal (`#009E73`) for leveled
slopes, and Sky Blue (`#56B4E9`) for traversable water. Draw every change as a
filled circle with a 0.39-cell radius and a Shadow Grey (`#282828`) edge 0.035
cells wide, with no halo. Center terrain, obstacle, and water changes on their
cells. Center one slope marker at the midpoint of each leveled edge. Use the
same circles in map legends; slope counts represent leveled edges. These colors
are specific to the tactical map and do not add tokens to the official palette.

Preserve the existing start diamond and goal circle colors and shapes, each
with a 0.4-cell radius.

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
  --map-change-terrain: #cc79a7;
  --map-change-obstacle: #e69f00;
  --map-change-slope: #009e73;
  --map-change-water: #56b4e9;
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
