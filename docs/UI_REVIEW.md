# Mobile UI review

## Opus pass (feat/ui-opus-pass, 2026-11-26)
Inventory: 30 routes in `mobile/src/App.jsx` (7 splash/auth, 5 tabs, 4 run, map, stats, notifications, 7 settings/privacy/data, 3 redirects, 404) and the `src/ui` kit (Button, TextField, Switch, Chip, Segmented, Card, StatGrid/StatTile, Banner, ListRow, Section, Sheet, Dialog, Toast, InlineNotice, Skeleton, EmptyState, ErrorState, Avatar, Screen, TabBar, RunStats, HoldButton, CountUp). Method: code critique against docs/ai/05 with the frontend-design, design-critique, accessibility-review and ux-copy skills, then an emulator check (see Visual check).

### High
- Fixed: Android WebView rendered the page title twice (header bar + h1). Large-title pattern: header title appears only after the h1 scrolls away.
- Fixed: Home had two competing heroes (start card + territory tiles) and up to three primary buttons. One hero: hexes held, Start run, map link; empty states are secondary.
- Fixed: Live recorder gave Pause, Finish and Discard similar weight with Discard as a full-width red button. Sticky thumb-zone bar (Pause + hold-to-finish), Discard demoted to a small button; distance is giant and high-contrast for sunlight.
- Fixed: Run summary showed totals before the territory result. "+N hexes" now leads, totals follow in a compact row.
- Fixed: Uppercase tracked eyebrows above every h1 ("Account settings", "Your progress", "A little ground. A good run.") read as template chrome. Removed; sentence case throughout.
- Fixed: Global `[aria-pressed=true]` outline drew a second ring on segmented buttons, the password eye and follow buttons. Removed; pressed states are styled per component.
- Fixed: Splash/welcome used theme tokens on an always-dark photo, so in light theme hint text, links and notices were dark-on-dark. `.theme-media` scope keeps them dark and legible.
- Fixed: Splash was taller than the screen and its log-in hint sat under the gesture bar (found on the emulator).
- Fixed: Consent screen said "No location is collected in this build" and "When recording arrives". Copy now matches the built recorder.
- Open: The Android theme is `Theme.AppCompat.Light` with force-dark off (EDGE_CASES UI-04), so phones always show the light theme. Owner decision (see FINAL REPLY / DECISIONS).

### Medium
- Fixed: Lists showed a primary Follow button on every row; Follow is secondary, Following is ghost, both 44 px.
- Fixed: Every section was a bordered card with an uppercase label, including charts and badge grids (cards in cards). Grouped list sections vs `plain` content sections.
- Fixed: Tab bar filled the whole active tab with pine. Accent-dim pill behind the icon, label in full ink; unread badge uses clay.
- Fixed: Buttons and inputs were pills; controls now use the 14 px control radius, chips/segmented stay pills.
- Fixed: Two focus colours (pine globally, ochre on buttons). One 3 px ochre ring.
- Fixed: `Skeleton shape="stat"` had no styles; stat, row and card skeletons now mirror the final layout.
- Fixed: Workout was a single-sport card plus three outline buttons. Start card with one primary action and list rows (map, stats, history) with icons.
- Fixed: Stats tabs were chips; now a segmented tablist. Notifications: "Mark all as read" sits beside the title; days are grouped sections.
- Fixed: Settings mixed Sign out into an "App" list card. Account card shows the avatar, Sign out stands alone, danger zone last.
- Fixed: Invalid `rgb(var(--danger-rgb) / .4)` meant the danger section border never rendered.
- Fixed: Splash had a looping chevron animation and hover lift; replaced with a plain "Get started" button and a specific promise.
- Fixed: Profile totals glued value and unit ("20.00km" for screen readers); tiles split value and unit with a space.
- Fixed: "Getting ready" and other status screens had no side gutter on the welcome shell (found on the emulator).
- Fixed: Legacy aliases (`--color-line`, `--muted`, ...) and dead styles (`.goal-*`, `.promo-*`, `.event-*`, `.sport-*`, `.outline-action`, `RouteTrace`) removed.
- Open: Leave team has no confirmation dialog (kept existing behaviour; now styled as destructive).
- Open: Privacy form rows and switches sit on the page background rather than a grouped surface.

### Low
- Fixed: Synthesised weights (750/800, 500) replaced with bundled 600/700.
- Fixed: Microcopy: feed empty ("Your feed is quiet"), team empty ("Run with a team"), sessions/methods empty states, meta strings joined with "·" in visible copy.
- Open: Toast timeout is fixed at 4 s with no pause on touch.
- Open: Stats chart bars are not announced per bar beyond the summary label.
- Open: Map FABs and legend use a float shadow over tiles (documented exception in 05).

### Visual check (emulator, Pixel-class 1080x2400)
- Verified: splash, welcome, log in, create account (with inline errors and scrolled header), reset password; light theme with the committed build, dark theme with a temporary local DayNight build (not committed); 412 px and 360 px at font scale 1.3 for splash and welcome.
- Not verified: every signed-in screen (Home, Workout, live run, summary, history, map, community, stats, notifications, profile, settings). The app was logged out and no credentials were used. These were checked by tests and code review only.

---

## Earlier pass (feat/ui-ux-pass)

Scope: `mobile/` only. Method: code and token review of every screen against hierarchy, spacing, type, contrast, touch targets, motion, consistency and copy, for dark and light themes at 360 and 412 px. Not verified on a device or in an emulator screenshot; see "Not verified".
Status: **Fixed** = done in this pass, **Open** = left for the owner.

## High
- Fixed: Light theme sheets, dialogs and toasts used hardcoded dark backgrounds with dark text (unreadable). Now use `--surface-raised`, `--toast-bg`.
- Fixed: `.ui-run-stats`, `.claim-tile`, `.stat-labels` read undefined tokens (`--color-line`, `--color-muted`, `--color-pine`, `--muted`), so dividers and labels were missing. Aliased to real tokens.
- Fixed: Live run screen gave Time, Distance and Pace equal weight. Distance is now the large accent figure, first in order.

## Medium
- Fixed: Micro labels at 9 to 10 px (tab labels, stat captions, section titles, goal kicker, event month). Raised to 11.5 to 12 px; tab labels no longer all-caps.
- Fixed: Uppercase tracking too wide (.16 to .2em) on eyebrows and field labels. Reduced.
- Fixed: Unearned badges used `opacity: .7`, which lowers text contrast. Now full-opacity text with an accent edge on earned ones.
- Fixed: Notification read rows and dividers were too heavy or too faint. Read titles dim; dividers use `--line`.
- Fixed: Leaderboard rank and value were plain text. Rank is now a muted numeral, top three in accent; values are tabular.
- Fixed: Badge chips and territory tiles appeared with no motion. Added a one-time pop and staggered rise (disabled by reduced motion).
- Fixed: Chips, tabs, segmented controls and bell had no press feedback. Added scale-on-press.
- Fixed: Hardcoded `.form-error` colour (`#e5826b`) ignored the theme. Uses `--danger-strong`.
- Fixed: Copy: vague empty and error states ("Nothing new", "No one ranked yet", "No stats yet", "Something went wrong", "Get ready to run"). Rewritten to say what to do next.
- Fixed: No tactile feedback. Added `ui/haptics.js` on buttons and switches. It is a no-op because the manifest has no VIBRATE permission (owner decision to add).
- Open: Welcome and splash screens use fixed dark colours in both themes. Intentional brand direction; kept (now via `.theme-media`, see Opus pass).
- Fixed (Opus pass): `RouteTrace` and the `.sport-card` / `.promo-card` / `.event-card` / `.goal-*` leftovers removed.

## Low
- Fixed (Opus pass): Feed card label "Territory Run" no longer repeats on every post.
- Open: Stats chart bars are not announced per bar to screen readers beyond the summary label.
- Fixed (Opus pass): section titles and labels are sentence case.
- Open: Toast timeout is fixed at 4 s with no pause on touch.

## Not verified
Contrast ratios were checked from token values, not measured on rendered output. 360 and 412 px layouts were reviewed from CSS (flex and clamp rules), not on a device. Screens were not screenshotted.

## T12 accessibility / small-screen audit (static)
Method: code and CSS review only (no device or screen access). Not visually verified.

## Fixed
- Text below 12 px: tab-bar labels (.68rem) and splash sub-brand (.58rem) raised to .75rem.
- Settings row values no longer truncate with an ellipsis (wrap and right-align) so font scale 1.3 keeps the full value.

## Already compliant (verified in CSS/markup)
- Touch targets: buttons/inputs/links 48 px min, chips/segmented 44 px, tab items 50 px.
- Focus ring on all controls (accent or warn outline), sheets/dialogs trap and restore focus (role=dialog, aria-modal).
- prefers-reduced-motion disables animation and transitions globally; count-up shows final value.
- Status/error messages use role=status/alert; contrast script passes in dark and light.
- Narrow screens: single-column grids under 340-350 px.

## Left for owner device check (T17)
- Real 360/412 px and font-scale 1.3 rendering, TalkBack reading order, light-theme map tile contrast.
- Chart axis labels (.stat-labels) clip rather than wrap at large font scale.
- Some pages still use a few literal px sizes outside tokens.

## T19 pass (feat/ui-t19-palette-guard)
Method: code review with the frontend-design, web-design-guidelines, accessibility-review, design-critique and ux-copy skills. Not checked on a device.
- Fixed: `index.html` viewport had `maximum-scale=1.0, user-scalable=no`, which blocks pinch zoom (WCAG 1.4.4, web guideline). Removed.
- Guard: `npm run check:palette` (also in `npm run check`) fails on lime, electric cyan, hot magenta and purple-to-blue gradients anywhere in mobile/src, index.html, android res and built CSS, and on colour literals outside token files and documented exceptions. Verified failing on a lime and gradient sample.
- Checked OK: visible focus styles on all controls, 44 px+ touch targets (buttons, chips, tabs, icon buttons), `role="status"` on toast/skeleton, decorative images `alt=""`, no `outline:none` except `h1:focus`, no `transition: all`, no sub-12 px labels.
- Open: `h1:focus { outline: none }` is acceptable only because h1 receives programmatic focus on route change.
- Open: Welcome/splash fixed dark colours kept by brand decision (see earlier pass).
- Open: copy and layout were reviewed by code only (feed label repetition since fixed in the Opus pass).
