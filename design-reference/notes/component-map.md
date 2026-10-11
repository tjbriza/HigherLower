# Provisional Component Relationship Map

This is a design-evidence map, not a prescribed React component tree.

## Home

```text
Home / Setup
├── Theme control
├── Hero
│   ├── wordmark
│   └── supporting copy
├── Domain / category selector
│   ├── domain option (selected / unselected)
│   └── comparison-category option
├── Mode selector
│   ├── Classic
│   ├── Time Attack
│   └── Co-op
└── Ready / Go CTA
```

The four supplied domain screenshots are states of one domain/category selector, not separate screens.

## Shared gameplay system

```text
Gameplay shell
├── Background grid
├── Gameplay header
│   ├── Back control
│   ├── Context title
│   ├── Secondary/status region
│   └── Score/status metric
├── Comparison layout
│   ├── Current/revealed card
│   ├── Center divider
│   │   └── OR badge
│   └── Next/decision card
└── Comparison actions
    ├── Higher
    └── Lower
```

## Mode variants

### Classic
- mode accent: `#6355CB`
- standard score
- no additional status UI supplied

### Time Attack
- mode accent: `#D93FD0`
- standard score
- remaining-time metric
- horizontal timer/progress bar

### Co-op
- mode accent: `#FFCC00`
- team score
- player-turn chips
- player-aware decision prompt
- turn-transfer helper copy

## Shared comparison-card roles

**Current / revealed**
- `current` label
- image
- title
- revealed comparison value

**Next / decision**
- `next up` label
- image
- title
- decision prompt
- actions appear below / within the decision region

Co-op modifies the next-card prompt to include the active player.

## Shared status-metric pattern

Observed visual pattern:

```text
numeric value
small muted label
```

Examples:
- `14 / score`
- `12 / second(s) left`
- `14 / team score`

## Co-op player state

Observed:
- Player 1: cyan, active/full emphasis
- Player 2: magenta, inactive/reduced opacity

Player 2 active appearance is not directly supplied.
