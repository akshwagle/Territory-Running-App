# Mobile UI review (feat/ui-ux-pass)

Scope: `mobile/` only. Method: code and token review of every screen against hierarchy, spacing, type, contrast, touch targets, motion, consistency and copy, for dark and light themes at 360 and 412 px. Not verified on a device or in an emulator screenshot; see "Not verified".
Status: **Fixed** = done in this pass, **Open** = left for the owner.

## High
- Fixed: Light theme sheets, dialogs and toasts used hardcoded dark backgrounds with dark text (unreadable). Now use `--surface-raised`, `--toast-bg`.
- Fixed: `.ui-run-stats`, `.claim-tile`, `.stat-labels` read undefined tokens (`--color-line`, `--color-muted`, `--color-pine`, `--muted`), so dividers and labels were missing. Aliased to real tokens.
- Fixed: Live run screen gave Time, Distance and Pace equal weight. Distance is now the large accent figure, first in order.
- Open: Fonts load from Google Fonts at runtime. Offline or on a bad connection the app falls back to system sans. Needs bundled fonts (`@fontsource` Inter and Space Grotesk); skipped because it adds dependencies.

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
- Open: Welcome and splash screens use fixed dark colours in both themes. Intentional brand direction; kept.
- Open: `RouteTrace` and the `.sport-card` / `.promo-card` / `.event-card` styles are unused leftovers.

## Low
- Open: Feed card label "Territory Run" repeats on every post.
- Open: Stats chart bars are not announced per bar to screen readers beyond the summary label.
- Open: `.ui-section > h2` and labels are still uppercase; fine at 12 px but not for long strings.
- Open: Toast timeout is fixed at 4 s with no pause on touch.

## Not verified
Contrast ratios were checked from token values, not measured on rendered output. 360 and 412 px layouts were reviewed from CSS (flex and clamp rules), not on a device. Screens were not screenshotted.
