# UI Interaction Audit — HigherLower

**Task type:** Analysis only (read-only audit write-up).
**Scope:** Motion/animation and interaction-feedback opportunities across the home
setup flow and both gameplay modes, plus loading and secondary UI.
**Status:** No application code, config, rule files, or other files were modified.
No packages were installed. No builds were run. No `.env`/`.env.local` or other
secret-bearing files were inspected. Provider/API/category-availability work was
not reopened.

This report is descriptive and evidence-grounded. It does not authorize changes.
Every recommendation below is a proposal; items that require an owner call are
labeled `Needs Verification [product-decision]`.

---

## 1. Evidence Base

| Fact | Evidence |
|------|----------|
| Motion is already a dependency (`motion@^14.1.0`) | [`package.json`](package.json:15) |
| `radix-ui@^1.7.0` is the approved primitive source | [`package.json`](package.json:16) |
| `lucide-react` is the icon library | [`package.json`](package.json:14) |
| Only one shadcn primitive exists | [`components/ui/button.tsx`](components/ui/button.tsx:1) |
| Global reduced-motion kill-switch must be preserved | [`app/globals.css`](app/globals.css:124) |
| Gameplay reveal/transition/game-over visuals were **not** supplied | [`design-reference/notes/open-questions.md`](design-reference/notes/open-questions.md:14) |
| Missing target visuals must **not** be read as removal of current behavior | [`design-reference/notes/open-questions.md`](design-reference/notes/open-questions.md:26) |

**Existing keyframes:** `pulse-ring`, `shimmer`, `fadeInUp`, `fadeInScale`,
`orb-float`, `shake`, `timer-urgent`, `floatUp`.

**Dead CSS (defined, unused):** `.fade-in-up`, `.fade-in-scale`, `.timer-urgent`,
`.pulse-ring`, `.shimmer`, `.orb`, `.glass`, `.glass-hover`, `.text-gradient`,
`.card-selected`, `.btn-primary`, `.btn-gold`, `.section-label`, `.stripe-accent`.
`.shake` and `.float-up` **are** used.

**Dead class reference:** `home-go` on the Go button has no CSS definition
([`components/home/HomeSetup.tsx`](components/home/HomeSetup.tsx:201)).

`design-reference/` is treated as read-only visual authority throughout.

---

## 2. Per-Area Audit

### 2.1 Home hero — [`app/page.tsx`](app/page.tsx:1), [`components/home/HomeSetup.tsx`](components/home/HomeSetup.tsx:1)

- **Current:** Static hero, per-word text-shadow wordmark, no entrance animation.
- **Gap:** Appears fully formed; no continuity to the below-fold setup; the
  `min-h-dvh` hero gives no scroll cue.
- **Animation helps:** Marginally (decorative).
- **Technique:** `motion.span` staggered entrance ~250–350 ms with `once: true`;
  optional scroll cue; no `layoutId`.
- **shadcn:** None.
- **Keep custom:** Yes.
- **Reduced motion:** No-op / opacity-only.
- **Risk:** Low — must not change hero height or push setup into the fold.
- **Priority:** Low.

### 2.2 Domain selection — [`components/home/DomainSelector.tsx`](components/home/DomainSelector.tsx:1)

- **Current:** Native radio group; selected = magenta ring + dot + text-shadow;
  selecting a domain resets category.
- **Gap:** The category list below changes with **no transition** — the most
  jarring home moment.
- **Animation helps:** Yes (continuity).
- **Technique:** `AnimatePresence` `mode="wait"`/`"popLayout"` around the category
  list keyed by `selectedDomainId`, ~150–200 ms; optional `layout` on the
  indicator dot; avoid `layoutId` across domains.
- **shadcn:** RadioGroup **not** recommended (would fight the custom indicator).
- **Keep custom:** Yes.
- **Reduced motion:** Collapse to instant.
- **Risk:** Medium — must not break `role="radiogroup"` / `aria-labelledby`.
- **Priority:** Medium.

### 2.3 Category selection — [`components/home/CategorySelector.tsx`](components/home/CategorySelector.tsx:1), [`components/CategoryCard.tsx`](components/CategoryCard.tsx:1)

- **Current:** Radio group of cards; selected = ring + dot + text-shadow;
  unavailable = `opacity-55`, disabled.
- **Gap:** No hover feedback on the card body; hard color swap; static
  "Unavailable" tag.
- **Animation helps:** Mildly.
- **Technique:** `motion.label` `whileHover`/`whileTap`; keep selection as a CSS
  transition; no `layoutId`.
- **shadcn:** None — must **not** convert custom category cards to shadcn Card.
- **Keep custom:** Yes (required).
- **Reduced motion:** Hover/tap off.
- **Risk:** Low–medium — preserve `peer` / `focus-within` ring.
- **Priority:** Low–Medium.

### 2.4 Mode selection — [`components/ModeButton.tsx`](components/ModeButton.tsx:1)

- **Current:** Radio group; selected = ring + dot + text-shadow; PvP `comingSoon`
  disabled; incompatible modes disabled.
- **Gap:** No hover affordance; disabled state is flat opacity with no
  explanation.
- **Animation helps:** Mildly; the real gap is a disabled-reason tooltip
  (behavior/a11y).
- **Technique:** `motion.label` hover/tap; optional `AnimatePresence` for the
  disabled hint.
- **shadcn:** Tooltip is a genuine fit for the disabled-mode reason (trigger must
  wrap the label, not the disabled input).
- **Keep custom:** Yes for the button; Tooltip is additive.
- **Reduced motion:** Hover off.
- **Risk:** Low.
- **Priority:** Medium.

### 2.5 Ready/Go CTA — [`components/home/HomeSetup.tsx`](components/home/HomeSetup.tsx:201)

- **Current:** Circular button `disabled={!canPlay}`; flat gray disabled swap;
  helper copy when disabled; `home-go` class is dead.
- **Gap:** Instant enabled/disabled transition; no "ready" pulse.
- **Animation helps:** Yes — the strongest home-screen candidate.
- **Technique:** `motion.button` one-shot scale/glow keyed on `canPlay` +
  `whileTap`; avoid infinite pulse.
- **shadcn:** None.
- **Keep custom:** Yes.
- **Reduced motion:** Suppress pulse.
- **Risk:** Low — must not alter the fixed `size-36` / `size-44`.
- **Priority:** Medium–High.

### 2.6 Classic gameplay — [`components/game/ClassicGame.tsx`](components/game/ClassicGame.tsx:1)

Shell/board/card/controls/status/divider/DerivedGameState.

- **Current:** Phases `playing → revealing → playing | game-over`; a guess sets
  tint + `lastCorrect`, then a 1500 ms `setTimeout` reveals/advances; reveal =
  tint overlay + border + fading status line; score is a plain number; card swap
  is a hard remount via `key={currentItem.id}`; keyboard ArrowUp/h, ArrowDown/l;
  game-over is an inline absolutely-positioned `role="dialog"` div (not a native
  `<dialog>`).
- **Gaps:** Card swap pops with zero continuity (**biggest**); score increments
  with no emphasis; reveal tint is instant; game-over is instant; status line is
  acceptable.
- **Animation helps:** Strongly for card swap + reveal tint; moderately for score
  + game-over.
- **Technique:** `AnimatePresence` + `motion.div` keyed on item ids (~150–200 ms)
  with the 1500 ms timer as source of truth; `motion.div` opacity fade on the
  tint overlay; keyed `motion.span` score pop; `AnimatePresence` + `motion.div`
  game-over entrance.
- **shadcn:** The game-over overlay lacks focus trap/Escape (unlike
  [`components/HighScoresModal.tsx`](components/HighScoresModal.tsx:125), which
  uses a native `<dialog>`) — shadcn Dialog would genuinely improve focus
  management; but it changes behavior, so flag as a product decision.
- **Keep custom:** Cards/board/divider/controls must stay custom; the game-over
  dialog is the only primitive candidate.
- **Reduced motion:** All collapse to instant; the reveal timer still runs.
- **Risk:** **HIGH** for card swap (sits on the 1500 ms window + deck advance);
  medium otherwise.
- **Priority:** High.

### 2.7 Time Attack gameplay — [`components/game/TimeAttackGame.tsx`](components/game/TimeAttackGame.tsx:1)

- **Current:** 60 s countdown; correct = +1 score / +3 s / 800 ms reveal; wrong =
  −5 s / 400 ms reveal + `shake` 460 ms; floating `+3s` / `−5s` via `float-up`;
  progress bar `duration-1000 ease-linear`; urgent (≤10 s) changes timer color
  but the `timer-urgent` keyframe is never applied; game-over is a hand-rolled
  `role="dialog"`.
- **Gaps:** Urgent timer has no pulse despite a purpose-built unused keyframe;
  card swap hard remount; timer number doesn't react; progress bar is fine.
- **Animation helps:** For urgent pulse + card swap; keep the float label.
- **Technique:** Apply the existing `timer-urgent` keyframe (or a `motion` pulse)
  when `isUrgent` — reuse existing CSS; same `AnimatePresence` card swap but
  ≤ ~150 ms given the 800/400 ms windows; optional keyed timer pop.
- **shadcn:** Progress **not** recommended (the current `role="progressbar"` is
  already correct/bespoke); game-over Dialog same consideration as Classic.
- **Keep custom:** Yes.
- **Reduced motion:** Pulse/transitions off; countdown/reveal timers keep running.
- **Risk:** **HIGH** for card swap (shorter windows); medium for the urgent pulse
  (must not affect `role="timer"` `aria-live`).
- **Priority:** High.

### 2.8 Loading states

Route loaders: [`app/game/classic/page.tsx`](app/game/classic/page.tsx:1),
[`app/game/time-attack/page.tsx`](app/game/time-attack/page.tsx:1),
[`app/game/[mode]/page.tsx`](app/game/[mode]/page.tsx:1);
[`components/game/DerivedGameState.tsx`](components/game/DerivedGameState.tsx:1).

- **Current:** Async server components with no client loading UI;
  `DerivedGameState kind="loading"` exists with a spinning `LoaderCircle` +
  `motion-reduce:animate-none`, but **no route renders it**; there is no
  `loading.tsx` in any game route.
- **Gap:** Blank/white flash on game entry — the most visible unclear state.
- **Fix:** A `loading.tsx` route file rendering the existing loading state
  (optionally a card-shaped Skeleton) — not an animation per se.
- **shadcn:** Skeleton is a genuine fit; Spinner is not installed.
- **Keep custom:** `DerivedGameState` stays custom; Skeleton is additive.
- **Reduced motion:** The spinner already respects it; skeleton shimmer must too.
- **Risk:** Low (additive new files) but new scope.
- **Priority:** High.

### 2.9 Dialogs / secondary UI — [`components/HighScoresModal.tsx`](components/HighScoresModal.tsx:1)

- **Current:** Native `<dialog>` with `showModal()`, focus to the close button,
  Escape via `onCancel`; hand-rolled tablist/tab/tabpanel; inline confirmation
  panels; `aria-live` region.
- **Gap:** Dialog opens/closes instantly; tab panel swaps instantly;
  confirmations appear instantly.
- **Animation helps:** Mildly.
- **Technique:** `AnimatePresence` + `motion.div` for panel content and the tab
  indicator; do **not** animate the native `<dialog>` element itself (top layer,
  fragile) — animate inner content.
- **shadcn:** Tabs (Radix) is a reasonable fit; Dialog is not needed (native
  works); AlertDialog is a genuine fit for destructive confirmations.
- **Keep custom:** Score list/layout stay custom; Tabs/AlertDialog are additive.
- **Reduced motion:** Fades collapse.
- **Risk:** Low–medium — preserve `aria-controls` / `aria-labelledby`.
- **Priority:** Low–Medium.

### 2.10 Existing CSS / reduced motion

- The global kill-switch is correct ([`app/globals.css`](app/globals.css:124)).
- Any Motion work must honor it via `useReducedMotion` or
  `MotionConfig reducedMotion="user"`.
- Prefer reusing `timer-urgent` over new Motion.
- Treat broader dead-CSS cleanup as a separate optional task (scope discipline).

---

## 3. Cross-Cutting Feedback Table

| Feedback moment | Current behavior | Proposed technique | Priority |
|-----------------|------------------|--------------------|----------|
| Correct reveal | Tint + border, instant | `motion.div` opacity | High |
| Incorrect reveal | Tint + border, instant | `motion.div` opacity | High |
| Round transition | Hard remount | `AnimatePresence` | High |
| Score change | Plain number | Keyed `motion.span` pop | Medium |
| Game-over | Instant overlay, no focus trap | `AnimatePresence` + Dialog | Medium–High |
| Time delta | `float-up` already good | Keep | — |

---

## 4. Highest-Value Motion Opportunities

1. **Gameplay card swap / round transition** (Classic + Time Attack) — the single
   biggest continuity gap; `AnimatePresence` keyed on item ids.
2. **Reveal tint fade** (correct/incorrect) — cheap, high-perceived-quality.
3. **Urgent timer pulse** (Time Attack) — reuse the existing, unused
   `timer-urgent` keyframe.
4. **Ready/Go `canPlay` pulse** — strongest home-screen candidate.
5. **Domain → category continuity** — removes the most jarring home moment.
6. **Loading continuity** — `loading.tsx` rendering the existing loading state.

---

## 5. Recommended shadcn Components

| Component | Where | Rationale |
|-----------|-------|-----------|
| **Tooltip** | Mode selection ([`components/ModeButton.tsx`](components/ModeButton.tsx:1)) | Disabled-mode reason; trigger wraps the label, not the disabled input. |
| **Skeleton** | Game route loading | Card-shaped placeholder; additive to `DerivedGameState`. |
| **Dialog** | Game-over overlay (Classic + Time Attack) | Focus trap + Escape; **behavior change → product decision**. |
| **Tabs** | HighScoresModal | Radix tab semantics; additive. |
| **AlertDialog** | HighScoresModal destructive confirmations | Genuine fit for destructive confirmations. |

**Not recommended:** RadioGroup (would fight custom indicators), Progress (current
`role="progressbar"` is already correct), Spinner (not installed).

---

## 6. Components That Should Explicitly Remain Custom

- Category cards — [`components/CategoryCard.tsx`](components/CategoryCard.tsx:1)
  (must **not** become shadcn Card).
- Domain selector — [`components/home/DomainSelector.tsx`](components/home/DomainSelector.tsx:1).
- Mode button — [`components/ModeButton.tsx`](components/ModeButton.tsx:1)
  (Tooltip is additive only).
- Ready/Go CTA — [`components/home/HomeSetup.tsx`](components/home/HomeSetup.tsx:201).
- Gameplay cards/board/divider/controls — [`components/game/GameCard.tsx`](components/game/GameCard.tsx:1),
  [`components/game/ComparisonBoard.tsx`](components/game/ComparisonBoard.tsx:1),
  [`components/game/GameplayDivider.tsx`](components/game/GameplayDivider.tsx:1),
  [`components/game/DecisionControls.tsx`](components/game/DecisionControls.tsx:1).
- `DerivedGameState` — [`components/game/DerivedGameState.tsx`](components/game/DerivedGameState.tsx:1).
- HighScoresModal score list/layout — [`components/HighScoresModal.tsx`](components/HighScoresModal.tsx:1).

---

## 7. Proposed Implementation Phases

- **Phase 1 — Gameplay reveal + round transition (Classic + Time Attack):**
  card-swap `AnimatePresence`, reveal-tint fade, wire the existing `timer-urgent`
  pulse; strict respect for the 1500/800/400 ms timers.
- **Phase 2 — Loading continuity:** add `loading.tsx` route files rendering the
  existing loading state (optional card-shaped Skeleton).
- **Phase 3 — Home selection continuity:** `AnimatePresence` on the
  domain→category swap + Ready/Go `canPlay` pulse.
- **Phase 4 — Feedback polish:** score pop, game-over entrance, hover/tap on
  category/mode cards, disabled-mode Tooltip.
- **Phase 5 — Secondary UI:** HighScoresModal open/tab transitions; evaluate
  Radix Tabs/AlertDialog.
- **Phase 6 (optional, separate task):** dead-CSS cleanup and the `home-go` dead
  class.

---

## 8. Product / Design Decisions Still Needed

All items below are `Needs Verification [product-decision]`:

1. Should the hand-rolled game-over `role="dialog"` gain focus trap/Escape via
   shadcn Dialog?
2. May card-swap animation consume part of the 1500/800 ms reveal window, or must
   the window stay untouched?
3. Urgent timer treatment is implementation-defined (design-reference lists
   low-time/urgent visual + timer animation as unsupplied —
   [`design-reference/notes/open-questions.md`](design-reference/notes/open-questions.md:14)).
4. Loading UI shape: spinner vs card-shaped skeleton?
5. Is the decorative home hero entrance wanted at all?
6. Which shadcn additions (Tooltip/Skeleton/Tabs/AlertDialog) are in scope?

---

## 9. Verification Status

| Check | Status |
|-------|--------|
| Source read-back | `[Pass]` |
| Runtime / browser | `[Not tested]` |
| Build / lint | `[Not tested]` |
| Live provider calls | `[Not tested]` |
| Dead-CSS claim | `[Pass]` — source-level grep only |

No files were modified; no packages were installed; no secret files were
inspected.
