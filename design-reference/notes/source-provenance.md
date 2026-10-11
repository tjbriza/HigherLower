# Source Provenance and Handoff Caveat

## Included in this package

- All **38 design screenshots** supplied for this extraction:
  - 1 foundations/elements board
  - 11 Home/setup references
  - 8 Classic references
  - 9 Time Attack references
  - 9 Co-op references
- Normalized token/layout/type/component findings derived from the supplied screenshots and pasted Figma CSS.

A separate repository screenshot from the earlier `.roo/rules` discussion was intentionally excluded because it is not design evidence.

## Raw Figma CSS export

The full Figma `Extracted CSS all layers` content was supplied as pasted conversation text, not as a standalone source file. The normalized findings in this package use that CSS, but the **verbatim raw CSS export is not currently bundled**.

For the strongest standalone provenance before handing the package to another agent, preserve the original CSS export as a plain-text file alongside this archive, for example:

```text
design-reference/notes/figma-export.css
```

Do not reconstruct that file from the normalized notes if exact provenance matters; use the original export text.

## Evidence priority

When evidence conflicts:
1. Direct task/product decisions
2. Supplied screenshots for visual appearance/composition
3. Supplied Figma CSS for source geometry/properties
4. Normalized extraction notes
5. Current implementation as baseline only, never as target-visual authority
