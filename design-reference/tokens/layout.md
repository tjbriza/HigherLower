# Layout and Geometry Evidence

## Desktop source frames

- Home light-mode source frame: `1440 × 1024`
- Home dark scroll viewport: `1440 × 900`
- Home dark content height: `2638`
- Gameplay frames: `1440 × 900`
- Main Home category content width: approximately `1180px`
- Mode section width: approximately `1201px`

## Home composition

The supplied dark Home reference is a long vertical setup experience:

1. Hero
2. Domain/category selector
3. Mode selector
4. Ready/Go CTA

The Figma CSS shows large repeated vertical gaps between major setup sections. Preserve the spacious hierarchy, but do not promote raw absolute coordinates into runtime tokens without implementation review.

## Gameplay comparison cards

Source geometry shared across supplied modes:

- Outer instance: approximately `442 × 442`
- Main image card: `433 × 433`
- Border: `4px solid #FFFFFF`
- Radius: `36px`
- Offset layer: approximately `+12px x`, `+9px y`

Current and next cards share the same visual family but differ semantically.

## Gameplay asymmetry

Classic / Time Attack source positions:
- Current card top: approximately `206px`
- Next card top: approximately `149px`

Co-op:
- Current card top: approximately `206px`
- Next card top: approximately `171px`

The asymmetric vertical composition appears intentional.

## Gameplay header heights

- Classic: `89px`
- Time Attack: `108px`
- Co-op: `125px`

The shell grows to accommodate mode-specific status UI.

## Time Attack progress

- Track: `980 × 12`
- Example fill: `899 × 12`
- Radius: `56px`
- Track: white
- Fill: green `#1DA216`

## Important

PNG export dimensions are not source CSS dimensions. Use exported CSS/Figma measurements for geometry and screenshots for visual hierarchy/composition.
