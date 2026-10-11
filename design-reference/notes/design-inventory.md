# Target Design Inventory

This inventory reflects only the supplied Figma screenshots and exported CSS. It does not infer unsupplied application behavior.

## Home / setup

Canonical desktop dark screen:
- Hero wordmark: `higher or lower?`
- Supporting copy: `the comparison game for students` / `4 domains, 11 categories, free`
- Domain selector
- Comparison-category selector
- Mode selector
- Ready / Go CTA
- Theme-control icon is visually present

### Domains and comparison categories

**Movies & Series**
- movie/series rating — `which title is rated higher?`
- movie release date — `which came out later?`
- movie gross revenue — `which grossed more?`

**Gaming**
- game rating — `which game is rated higher?`
- game player count — `which game has more players?`
- game release date — `which game came out later?`

**Music**
- number of albums — `which artist has released more albums?`
- monthly listeners — `which artist has more monthly listeners?`
- album release date — `which album came out later?`

**Social Media**
- youtube subscribers — `which channel has more subscribers?`
- twitch followers — `which streamer has more followers?`

Total: **4 domains, 11 comparison categories**.

### Game modes

**Classic**
- Copy: `survive as long as you can. no clock, just skill.`

**Time Attack**
- Copy: `race the clock. every right answer buys more time.`

**Co-op**
- Copy: `team up with a friend and beat the board together.`

No selected-mode visual state was supplied.

## Gameplay

Supplied canonical screens:
- Classic — default decision state
- Time Attack — default decision state with timer
- Co-op — Player 1 active decision state

All three use the same broad comparison structure:
- gameplay header
- current/revealed card
- next/decision card
- center divider + OR badge
- score/status
- Higher / Lower actions

## Unrepresented visual states

No supplied screenshot establishes:
- correct-answer reveal
- incorrect-answer reveal
- game over
- restart
- result animation
- loading/error states
- hover/focus/pressed/disabled states
