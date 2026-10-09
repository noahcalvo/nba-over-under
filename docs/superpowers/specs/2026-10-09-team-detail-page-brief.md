For this task, use the design source of truth here: "/Users/noah/Desktop/projects/nba-over-under-draft/docs/superpowers/plans/Under card recolored vivid purple.png"

Build an NBA team detail page for our existing NBA Over/Under league app, using the attached screenshot as the visual reference.

First inspect the existing architecture, components, scoring functions, database schema, and data integrations. Reuse existing patterns and real league data. The screenshot’s team, managers, numbers, and sportsbook snapshot are illustrative—not values to hardcode.

Keep this implementation focused on the team detail page and the data needed to support it.

NAVIGATION

- Make team names/logos on League overview and Rosters clickable links to the team detail page.
- Scope the page to the current league and season.
- Include a breadcrumb back to Rosters.
- Include a “Team: Orlando Magic” dropdown displaying the currently selected team and allowing navigation among all 30 NBA teams.
- This dropdown is a team selector, not an upcoming-opponent selector.
- Preserve the existing sidebar navigation:
  League overview
  Rosters
  League settings
  Draft room

PAGE CONTENT

Header:
- Team logo and full name.
- League name and season.
- Team selector.
- “Show projected” toggle.

Top statistics:
1. Current regular-season win/loss record, plus games played out of 82.
2. The league’s locked win-total line, labeled “Frozen at draft.”
3. Projected season wins and the signed difference from the locked line.
4. Wins still needed for the Over to hit, plus games remaining.

Calculate wins needed for Over as:
max(0, floor(lockedLine) + 1 - currentWins)

Use the existing projection/scoring functions. Do not create a second scoring implementation.

SEASON PROGRESS CHART

This chart compares cumulative actual wins against the pace needed to reach the league’s locked season win-total line. It is NOT a per-game betting spread chart.

Series:
- Actual cumulative wins: blue solid line through completed games.
- Locked-line pace: muted gray dashed line.
- Projected cumulative wins: blue dashed continuation through future games.

Locked-line pace at game number n:
lockedLine * n / 82

Actual cumulative wins must come from completed regular-season game results. Each win increases the total by 1; each loss leaves it unchanged. Exclude preseason and playoff games.

Projected continuation should start at the current actual-win total and extend at the current season win rate, consistent with the app’s existing season projection.

Use a clear legend:
- Actual wins
- Locked-line pace
- Projected wins

Axes:
- X: game number within the regular season.
- Y: cumulative wins, NOT wins above/below the line.
- Hover/tap tooltip should expose game number, actual wins where available, locked-line pace, and projected wins where applicable. Include game date, opponent, and result when available.

CHART VIEW CONTROLS

Use a segmented control with these exact labels:
- “Last 8”
- “Full season”

Default to “Last 8.”

“Last 8” means:
- The latest 8 completed games plus the next 2 future game positions.
- Normally, this produces a 10-position window.
- Example: after game 48, show game positions 41–50.
- Subtitle: “8 completed games + 2 upcoming.”
- Mark the current completed game with a subtle vertical dashed line and “Now” label.
- Lightly shade the future region and label it “Upcoming.”
- Actual wins stop at the current completed game.
- Projected wins continue into the future region.

Adapt near the beginning and end of the season:
- Show only available completed games if fewer than 8 exist.
- Never extend beyond game 82.
- Adjust the subtitle to reflect the actual number of completed and upcoming game positions.

Zoomed-in Y-axis:
- Automatically fit the visible actual-win and locked-line-pace series so their combined vertical range occupies approximately 70% of the plot height.
- Include any visible projected continuation in the bounds so it is not clipped.
- Leave padding above and below, approximately 15% each.
- Use sensible readable ticks and a minimum range when the values are identical or almost identical.
- Do not force the Y-axis to start at zero in this view.

“Full season” means:
- Show the entire 82-game season.
- Use a broader Y-axis starting at zero, with enough headroom for all visible series.
- Actual wins still end at the latest completed game.
- Locked-line pace extends through game 82.
- Projected continuation extends through game 82 when projections are enabled.

Switching back to “Last 8” restores the latest window, not an arbitrary prior location.
The segmented control handles zoom; do not add a separate zoom button.

SHOW PROJECTED TOGGLE

Use one “Show projected” toggle, not “Projected / Final results” tabs.

When enabled:
- Show projected season wins and projected margin.
- Show the chart’s projected continuation and its legend/tooltip entries.
- Show projected points for Over/Under owners.
- Show projected fade outcomes and points.

When disabled:
- Hide those projected values and labels.
- Keep current record, games played, locked line, wins needed, ownership, fade targets, actual wins, and locked-line pace.
- Do not replace projections with fake final results or treat pending picks as zero.
- Recalculate chart bounds using the remaining visible series.
- Keep the layout tidy without empty placeholders.

SPORTSBOOK LINE PANEL

Show:
- Source.
- Line at draft: the league’s locked line.
- Latest available line.
- Movement: latest available line minus locked line.
- Source timestamp / last successful update when available.
- A brief note that league scoring uses the locked line.

Our current integration uses FanDuel. Reuse it; do not introduce DraftKings as an additional provider for this page.

Inspect whether we currently fetch only preseason lines or also support updated season win-total markets. Do not present the frozen line as a newly fetched current line.

If a latest market line is unavailable:
- Show a clear unavailable state.
- Preserve the league’s locked line.
- Do not substitute zero, fabricate movement, or claim stale data is live.
- A missing market must not prevent the rest of the page from loading.

OVER / UNDER OWNERSHIP

Show two cards:
- OVER: green heading and outline.
- UNDER: purple heading and outline.

Each card should include:
- Manager avatar/name, or “Undrafted.”
- Projected points when Show projected is enabled.
- Clear status explaining whether that pick is on track to hit or miss.

The colored outline should intersect the heading’s vertical midpoint, pause around the heading text, and resume after it, like a fieldset legend.
No arrows beside the headings.
No duplicate or ghost borders.
Do not repeat the pick direction unnecessarily inside its own card.

Color conventions:
- Green identifies Over.
- Purple identifies Under.
- Positive point values are green.
- Negative point values are red.
- Point-value colors are independent of pick direction.
- Use text as well as color to communicate status.

FADES

Under each ownership card, show all managers fading that specific pick.

Existing rules:
- Each manager gets one fade.
- Fades target another manager’s drafted pick.
- Multiple managers can fade the same pick.
- A fade is on track when its targeted pick is on track to MISS.
- Successful fade awards 2 points; unsuccessful fade awards 0.
- Reuse existing fade logic.

Show:
- Fading manager.
- Target pick direction.
- “On track” or “Off track” when projections are enabled.
- Projected fade points when projections are enabled.

If nobody is fading that pick, show “No fades on this pick.”
Support multiple fading managers; the screenshot only shows one example.

DATA AND SCORING

Use the league’s frozen line everywhere league scoring or locked-line pace is calculated. A current sportsbook line must never change drafted picks or league scores.

Existing scoring:
- Correct call: +1.
- Missed call: -1.
- Add 0.1 points per signed win of margin.
- Over signed margin = wins - lockedLine.
- Under signed margin = lockedLine - wins.
- Successful fade: +2; otherwise 0.

Keep existing push, finality, and projection behavior. If an edge case is undefined, identify it rather than inventing a new rule.

DATA DEPENDENCIES

The current standings integration may provide aggregate records without game-by-game history. Inspect this before building the chart.

If history is missing:
- Extend the existing NBA data-provider approach to obtain regular-season game results.
- Keep fetching and normalization server-side and follow existing caching/storage patterns.
- Derive cumulative wins from actual results.
- Do not manufacture a historical curve from the current record.
- Future chart positions can be game-number placeholders; do not invent opponents or dates.

Handle:
- Loading.
- Team with no completed games.
- Partial or unavailable game history.
- Missing sportsbook markets.
- Undrafted sides.
- No fades and multiple fades.
- Completed season.

If history is unavailable, show a useful chart-unavailable state while preserving the rest of the team page.

DESIGN AND RESPONSIVENESS

Match the screenshot and existing app:
- Dark navy/slate surfaces.
- Lime accents.
- Green Over and purple Under.
- Clean typography, subtle dividers, generous spacing.
- No slogans, awards, or unrelated statistics.

Desktop:
- Summary statistics across the top.
- Large chart on the left.
- Smaller sportsbook panel on the right.
- Over and Under ownership cards below.

Mobile:
- Use Tailwind responsive layouts.
- Stack panels logically.
- Keep controls and chart labels readable.
- Support touch tooltips.
- Avoid horizontal page overflow.

VALIDATION

Run appropriate existing tests, type checks, and build checks.
Add meaningful coverage for chart-window selection, Y-axis bounds, and new game-history normalization where applicable.
Check the page at desktop and mobile widths.

When finished, summarize:
- What was implemented.
- Which existing integrations were reused.
- Whether game history and live market movement are available.
- Any remaining data limitations.
- Validation performed.

Do not broaden the task into redesigning other pages or changing league rules.