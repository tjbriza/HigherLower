# Color Evidence

These values are extracted from the supplied Figma CSS and screenshots. Semantic names below are descriptive observations, not final runtime token names.

| Value | Observed role |
|---|---|
| `#15122B` | Primary dark surface; gameplay/home background; dark circular faces |
| `#FFFFFF` | Primary foreground, outlines, borders, timer track |
| `#D4CEFF` | Muted/supporting text |
| `#6355CB` | Classic mode offset/shadow accent |
| `#D93FD0` | Time Attack accent; magenta selection/accent; Classic/Time Attack Lower action |
| `#22D3EE` | Higher action; Player 1 color; cyan hero accent |
| `#FFCC00` | Co-op accent; Co-op Lower action; revealed rating/value highlight; Player 3 color |
| `#1DA216` | Time Attack progress fill; Player 4 color |
| `#8E8E8E` | Dashed gameplay divider |
| `#121212` | Dark foreground in light contexts; button text |
| `#787493` | Palette value; semantic role not yet confirmed |
| `#6F5CF0` | Hero lower-word offset/accent observed in exported CSS |
| `#838CF3` | Ready/Go CTA backing layer |
| `rgba(162, 168, 237, 0.19)` | Dark-grid line treatment |
| `#000000` | Some icon/button foregrounds in exported CSS |

## Mode accent system

- Classic: `#6355CB`
- Time Attack: `#D93FD0`
- Co-op: `#FFCC00`

The same mode accent is reused on the back-button offset, comparison-card offset, and OR-badge offset.

## Action colors

- Higher: `#22D3EE` in all supplied gameplay modes.
- Lower:
  - Classic: `#D93FD0`
  - Time Attack: `#D93FD0`
  - Co-op: `#FFCC00`

The rule behind Co-op's different Lower color is **Needs Verification**.

## Excluded editor artifact

`#8A38F5` appeared on a dashed Figma component-set boundary and should not be treated as a product token without further evidence.
