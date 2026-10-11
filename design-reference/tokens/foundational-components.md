# Foundational Component Geometry Evidence

Values below come from the supplied Figma CSS. They are source evidence, not implementation prescriptions.

## Selection indicator — elements board

Large/source instance:
- outer: `26 × 26`
- inner dark circle: `22 × 22`, offset `2px`
- selected center: `16 × 16`, offset `5px`
- selected center color: `#D93FD0`

Category/mode selector instances in the larger layout use a scaled form:
- outer: `19 × 19`
- inner: approximately `16.08 × 16.08`
- selected center: approximately `11.69 × 11.69`

## Gameplay back control

Default visual instance:
- component: `46 × 46`
- face: `42 × 42`
- offset/back layer: `42 × 42`, shifted approximately `4px`
- face: `#15122B`
- border: `2px solid #FFFFFF`
- icon box: `22 × 22`
- mode accent supplies the offset-layer color

A Figma `Variant2` exists, but its semantic meaning is **Needs Verification**.

## Player-profile indicator

Elements-board source instance:
- component: `46 × 46`
- visible circle: `42 × 42`
- border: `2px solid #FFFFFF`

Observed colors:
- Player 1: `#22D3EE`
- Player 2: `#D93FD0`
- Player 3: `#FFCC00`
- Player 4: `#1DA216`

Co-op player chips use smaller scaled profile indicators.

## OR badge

Small/source instance:
- component: `52 × 52`
- circular face/back layers: approximately `47.48 × 47.48`
- dark face: `#15122B`
- border: approximately `2.26px solid #FFFFFF`
- label: Space Mono 700, `14 / 21`

Gameplay-large instance:
- component: `89 × 89`
- circular layers: approximately `81.26 × 81.26`
- border: approximately `3.87px solid #FFFFFF`
- label: Space Mono 700, approximately `23.96 / 35`
- backing layer uses the current mode accent
