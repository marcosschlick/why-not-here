# Official Design System Color Palette

This document defines the strict, immutable color palette for all frontend interfaces, components, visual plots, and documentation in the project. Any agent or developer working on the UI/UX must strictly adhere to these color definitions.

---

## Color Tokens & Semantic Roles

### 1. Black & White (Surfaces & Core Contrast)
- **Off-White**: `#F8F8F8`
  - *Role*: Primary application background, card surfaces, canvas backdrops, neutral alternating rows.
  - *CSS Variable*: `--color-off-white`
- **Soft Black**: `#282828`
  - *Role*: Primary typography, high-contrast headings, main structural borders, dark icon strokes.
  - *CSS Variable*: `--color-soft-black`

### 2. Grays (Hierarchy & Secondary Elements)
- **Dark Gray**: `#6B6B6B`
  - *Role*: Secondary labels, metadata, captions, subtitle text, subtle separators, neutral active states.
  - *CSS Variable*: `--color-dark-gray`
- **Light Gray**: `#9B9B9B`
  - *Role*: Subtle borders, grid tick lines, disabled button backgrounds, placeholder text, inactive tab borders.
  - *CSS Variable*: `--color-light-gray`

### 3. Blues (Identity, Actions & Highlights)
- **Primary Blue**: `#324B64`
  - *Role*: Main brand headers, top navigation bar, primary action buttons, focused containers, table headers.
  - *CSS Variable*: `--color-primary-blue`
- **Secondary Blue**: `#647D96`
  - *Role*: Secondary action buttons, badge backgrounds, hover states for primary controls, card headers.
  - *CSS Variable*: `--color-secondary-blue`
- **Light Blue**: `#C8E1FA`
  - *Role*: Focus rings, active cell highlights, selection glow, subtle badge borders, hover backdrops.
  - *CSS Variable*: `--color-light-blue`
- **Vibrant Blue**: `#327DE1`
  - *Role*: Call-to-action (CTA) buttons, selected route paths on canvas, status indicators, progress bars, active switches.
  - *CSS Variable*: `--color-vibrant-blue`

---

## Design Directives
- **No Rogue Gradients**: Never introduce generic AI purple/neon gradients (`#8A2BE2`, `#7C3AED`, etc.). Use clean surfaces with deliberate borders and subtle elevation tints.
- **Contrast Ratios**: All text must pass WCAG AA minimum contrast against its background (`#282828` on `#F8F8F8` is $\approx 13.5:1$).
- **Translucency & Glassmorphism**: When using translucent surfaces (Apple-style blur), always tint with `#F8F8F8` or `#282828` with alpha channel (e.g. `rgba(248, 248, 248, 0.85)` with `backdrop-filter: blur(16px)`).
