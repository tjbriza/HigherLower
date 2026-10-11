# HigherLower Design Reference

This folder contains normalized **target-design evidence** extracted from the supplied Figma screenshots and exported CSS.

## Purpose

Use this archive to understand the intended visual system before implementation. It is not runtime source code and does not prescribe frontend architecture.

- `screens/` contains canonical full-screen references.
- `components/` contains isolated Figma component/state exports grouped by visual role.
- `tokens/` contains normalized design evidence extracted from the screenshots and Figma CSS.
- `notes/` contains the target inventory, component relationship map, known gaps, responsiveness guidance, provenance, and source mapping.

The structure is intentionally material-driven. No folders were added for unsupplied screens or flows.

## Evidence rules

1. Figma/CSS measurements are the geometry source.
2. Screenshots are the visual-composition source.
3. PNG export dimensions are not CSS dimensions; many exports were scaled.
4. The current codebase is an implementation baseline, not the target-design authority.
5. Missing Figma evidence is not an instruction to remove existing behavior.
6. Unspecified behavior remains `Needs Verification`.
7. Responsive layouts were not designed. Responsive behavior is implementation-defined using standard Tailwind mobile-first conventions while preserving desktop design intent.

## Current target surfaces represented

- Home / setup
- Classic gameplay
- Time Attack gameplay
- Co-op gameplay

No result/reveal/game-over states were supplied. See `notes/design-inventory.md`, `notes/component-map.md`, and `notes/open-questions.md` before implementation.

The verbatim raw Figma CSS was supplied in chat but is not bundled in this package; see `notes/source-provenance.md`.
