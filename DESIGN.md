# Plot Day design system (prototype)

## Art direction (settled June 2026)
The game's voice is the bespoke flat style — settled through live experiments, not a placeholder awaiting an art pass:
- **Structures** (cottage, huts, garage annex, trees, evergreens, fences, barrel, greenhouse): hand-coded SVG in one shared hand — no outlines, tonal shading, light from the upper left, soft ground-shadow ellipse under everything.
- **Crops & UI iconography**: bundled Twemoji SVGs (`assets/emoji/`), identical on every device and offline-safe, with hand-patched glyphs where Unicode falls short (plain pumpkin, kale, wintergreen, ribbons, tools).
- **Tested and rejected — twice**: AI-generated watercolor/painterly raster art (board sprites, then the garden-portrait share card, removed v0.6.5). Composited painterly art against flat tiles reads as mixed-media slop. Do not reintroduce raster composites; charm comes from consistency.
- **Share artifacts** are the emoji grid + ribbons: meaning over fidelity (Wordle ships gray squares).
- Banked stage-2 experiment (explicitly not a commitment): an isometric 2.5D sprite mockup, only after the current style + motion feel finished.

## Theme
Light, warm paper. Scene: a player at the kitchen table with morning coffee and sunlight; a dark theme would fight the entire premise of reading sunlight on a garden.

## Color
Strategy: committed. Warm cream paper carries the surface; soil browns and leaf greens do the work; terracotta is the single action color.

- `--paper: #f6eedd` page background (warm cream)
- `--paper-deep: #efe2c8` borders, wells
- `--ink: #4a3b2a` body text (warm brown, never black)
- `--ink-soft: #7a6a52` secondary text
- `--leaf: #5d8f4e` / `--leaf-deep: #3f6b35` brand green, headings, badges
- `--terracotta: #d9714e` / `--terracotta-deep: #b9552f` primary actions, selection
- `--soil: #b58963` / `--soil-deep: #93673f` board frame
- Sun scale (tile backgrounds, brighter = sunnier): `--sun-3: #ffe9a8`, `--sun-2: #e9e3a6`, `--sun-1: #c6d59b`, `--sun-0: #9db98f`
- Shade veil: `rgba(58, 76, 105, .42)` (cool blue, reads as shadow against warm sun tiles)
- Status: thrive `#4e9b3f`, ok `#e0a52e`, dead `#c4452e`

## Typography
- Display: "Baloo 2" (chunky, rounded, storybook) for headings, scores, buttons
- Body: "Nunito" for everything else
- Weights run heavy (700/800); this is a game, not a document

## Components
- Panels: `--card` white-cream, 2px `--paper-deep` border, 14px radius, soft drop shadow
- Buttons: chunky, 2px borders, terracotta for primary with hard 4px bottom shadow (toy-like press)
- Tiles: rounded 9px squares colored by sun level, sun pips top-left, status shown as inset ring
- Crop emoji are the bundled Twemoji set — a deliberate, settled choice (readable at tile size, charming, consistent everywhere), not a placeholder

## Motion
- Plant pop-in on placement, gentle sway on thriving plants after resolve
- Hover lifts (translateY -2px), nothing animates layout
