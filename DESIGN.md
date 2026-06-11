# Plot Day design system (prototype)

## Target art direction (locked June 10, 2026 — user references)
Three reference images (lofi/Ghibli painterly: seaside café, coffee van under cherry blossom, café terrace over turquoise sea — screenshots in project folder) define the destination style:
- **Feel**: soft painterly anime illustration, storybook warmth, "lofi girl" coziness
- **Light**: one warm golden source, soft gradient skies, gentle atmospheric depth
- **Foliage**: dense, layered leaf clusters with tonal variation — never flat fills
- **Palette**: turquoise water-blue, warm cream, terracotta, leaf greens, blossom pink accents
- **Materials**: warm wood, pale flagstone/cobble, terracotta pots, woven textures
- **Production**: this fidelity requires raster assets (AI-generated, style-locked prompts), not hand-coded SVG. Tier 1: garden-portrait share image composed from sprite assets. Tier 2: board textures + sprites under crisp UI chrome. The current SVG scene layer is the placeholder until then.

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
- Emoji are the placeholder art layer; a full illustrated pass replaces them later

## Motion
- Plant pop-in on placement, gentle sway on thriving plants after resolve
- Hover lifts (translateY -2px), nothing animates layout
