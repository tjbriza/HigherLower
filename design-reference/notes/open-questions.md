# Open Questions / Needs Verification

These gaps should remain unresolved until codebase evidence, owner direction, or additional design material supports a decision.

## Home

- Mode selected-state appearance was not supplied.
- Ready/Go enabled vs disabled behavior is not established.
- Theme-toggle interaction, persistence, and system-theme behavior are not established.
- Complete light-mode coverage is not established.
- `category-selector--movies-series--page-instance` uses muted helper text while the isolated state export uses white helper text. Final page evidence currently favors muted lavender.
- Back-button `Variant2` meaning is not established.

## Gameplay shared

No supplied Figma screenshots cover:
- correct-answer reveal
- incorrect-answer reveal
- score-increment feedback
- card transition / next-round transition
- game-over
- restart
- loading/image-error
- hover, focus, pressed, or disabled states

Missing target visuals must not be interpreted as removal of current behavior.

## Time Attack

- Low-time / urgent visual state
- Timer color changes
- Time-added feedback
- Timer expiration state
- Timer animation

## Co-op

Confirmed:
- at least two players
- active/inactive player visual state
- Player 1 active / Player 2 inactive example
- shared team score
- player-aware prompt
- copy indicating a wrong guess passes the turn

Needs Verification:
- Player 2 active appearance
- whether correct guesses retain the turn
- whether turns always alternate
- support for Player 3 / Player 4 in Co-op
- player-switch transition
- final team-score/game-over state
- reason Co-op Lower action uses yellow instead of magenta

## Content / imagery

The supplied gameplay images appear to be mock/placeholder imagery. They establish card treatment and image slots, not literal runtime media content.

## Responsiveness

No responsive layouts were supplied. See `responsiveness.md`.
