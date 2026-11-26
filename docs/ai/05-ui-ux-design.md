# UI/UX and design system

Goal: a premium, production-grade fitness app (think the polish of Strava, Nike Run Club, Whoop) that stays light and fast on mid-range Android phones. Calm, confident, athletic. Content first, chrome minimal. Dark-first; the light theme must be equally polished. Mobile only (Capacitor WebView, portrait, one-handed use). Never touch `web/`.

## Principles
1. One purpose per screen: one hero element (usually a big number or the map), one primary action.
2. Thumb zone: primary actions in the bottom third; top bar only for title, back and one secondary action.
3. Glanceable: during a run, numbers readable at arm's length while moving.
4. Show, don't explain: icons plus short labels; rules explained in one line where needed.
5. Every state designed: loading (skeleton), empty (what + next step), error (what happened + how to fix + retry), offline, permission denied, success.
6. Consistency over novelty: same component, spacing and motion everywhere.
7. Light weight: CSS only, SVG icons, no heavy libraries, no large images.

## Foundations (use the existing tokens in mobile/src/ui/ui.css; add, don't rename)
- Colour tokens: keep the existing token NAMES in mobile/src/ui/ui.css; only the values change to the palette below. Theme = dark default, light via prefers-color-scheme overrides. Never hardcode hex in components.
- Accent discipline: pine green is the single brand accent. It marks ONLY the primary action, the active tab, key live metrics and "my territory", under ~10% of any screen. Clay is a secondary signal for attention/danger only. Everything else is warm neutral. No glow, no gradients (flat fills only), no neon.
- Semantic colours always paired with icon or text, never colour alone. Map: mine = pine, others = dusty slate blue, cooldown = ochre, restricted = clay with hatch, flagged = ochre, error = clay.
- Typography: Barlow (body, 400/500/600) and Barlow Condensed (headings and big stat numbers, 600/700), matching the website. Both are already dependencies (@fontsource/barlow, @fontsource/barlow-condensed) so they are bundled locally: no runtime font request; import only the weights used, latin subset. Scale (px/line): display 48/48 (Condensed), title 28/32 (Condensed), headline 20/24 (Barlow 600), body 16/24, small 14/20, caption 12/16 (never below 12). Use `font-variant-numeric: tabular-nums` where Barlow supports it; otherwise give number slots a fixed min-width so digits never jitter. Respect OS font scaling (layouts survive 1.3x). System fonts as fallback.
- Spacing: 4 px grid (4, 8, 12, 16, 20, 24, 32, 40, 48). Screen padding 16-20, section gap 24, card padding 16, list row min height 56.
- Radius: --r-md 16, --r-lg 22, --r-xl 28, pill for chips/segmented. Controls 12-16. One radius family per screen.
- Elevation: borders (--line) and surface tint, not shadows. Shadow only for bottom sheets/dialogs/toasts.
- Icons: single set in `mobile/src/ui/icons.jsx`, 24 px grid, 1.75 px stroke, currentColor, aria-hidden with a text label. No emoji as icons.
- Safe areas: use --safe-top/--safe-bottom everywhere; tab bar and sticky CTAs sit above the gesture bar.

## Palette (proposed values; T01 verifies contrast with a script and may nudge a hex, never the roles)
Concept: "Clay & Pine", an outdoor, earthy, human palette from the owner's own website, not a tech-neon palette. Warm off-black and warm paper instead of pure black/white.

| Token | Dark (default) | Light |
| --- | --- | --- |
| --bg | #12110F | #F3EEE4 |
| --surface-raised-2 (cards) | #1A1816 | #FBF8F1 |
| --surface-raised (sheets) | #22201D | #FFFFFF |
| --line / --line-strong | rgba(241,236,226,.10 / .20) | rgba(31,36,33,.14 / .28) |
| --fill-1..5 | rgba(241,236,226,.03 .045 .05 .07 .09) | rgba(31,36,33,.035 .05 .06 .08 .10) |
| --text / --text-2 / --text-3 | #F1ECE2 / #B5AEA0 / #8D877B | #1F2421 / #454B45 / #5A5F58 |
| --accent (rgb) pine | #6FB59A (111,181,154) | #1F5A46 (31,90,70) |
| --accent-bright | #8CCBB1 | #2A7358 |
| --on-accent | #0E1713 | #F6F2E9 |
| --warn ochre | #E0B454 | #8A5F12 |
| danger clay (--danger-rgb) | #E58A72 (229,138,114) | #B8452A (184,69,42) |
| map: mine / others / cooldown | pine / #6F86A6 / #E0B454 | pine / #4F6480 / #B7822A |

Looks to avoid because they read as AI-generated: neon lime/cyan/purple on black, blue-to-purple gradients, glow shadows, glassmorphism cards, rainbow charts, emoji icons, generic stock-style rounded-card grids, centred hero + three feature cards layouts. Use real hierarchy, restrained colour, condensed athletic numerals and warm neutrals instead.

### Banned colours (hard rule, owner decision 2026-11-26)
No neon or "volt" colours anywhere in `mobile/`: no lime/chartreuse (hue about 65-120 degrees with saturation above 60% and lightness above 45%, e.g. #c5fd53, #b5ff14, #a6e84c, #ccff00), no electric cyan, no hot magenta, no purple-to-blue gradients. These read as AI-generated. The website in `web/` still uses #b5ff14 and is left as is (a teammate owns it); the app must not copy it. All colours come from the palette tokens above. `npm run check:palette --prefix mobile` (task T19) fails the build if a banned hue appears in mobile/src or android resources.

## Components (build/extend in mobile/src/ui; each has all states + tests)
- Button: primary (accent fill), secondary (fill-2 + line), ghost, destructive. Height 52 primary / 44 minimum, full-width in forms, loading state keeps width, disabled has reason text when not obvious.
- Input: 52 px, label above (not placeholder-only), helper/error line, clear/show buttons 44 px, correct inputmode/autocomplete, error shown on blur and submit, keeps value on failure.
- Card: surface-raised, line border, r-lg, 16 padding; tappable cards have pressed state.
- List row: 56+ px, leading icon/avatar, title + secondary, trailing value/chevron, divider inset.
- Stat tile: caption label, tabular number (display/title), unit in --text-3, optional delta chip.
- Chips/segmented control: 36-44 px high, selected = accent-dim + accent text + line-accent.
- Bottom tab bar: 5 tabs (Home, Workout, Community, Settings, You), icon + 12 px label, active = accent + indicator, unread dot on Home, hit area >= 48.
- Bottom sheet: grabber, drag-to-dismiss, scrim, focus trap, max 85% height, slides up (surface-enter).
- Dialog: only for destructive/irreversible confirmations; sheet otherwise. Toast: top-safe, auto-dismiss 4 s, one at a time, never blocks.
- Skeleton: matches the final layout, subtle shimmer (06). Empty state: simple SVG, one line what, one line why, one action. Error state: icon, plain sentence, Retry.
- Banner: offline / syncing / limited GPS, sticky below top bar, calm colours.

## Screen blueprints
- Welcome/Auth: brand mark, one-line promise, "Continue with Google" (official styling, see mobile/src/ui/README for the Google button spec) then email; short forms, inline validation, password strength hint, clear errors.
- Home: greeting + today status, primary "Start run" card (hero), territory snapshot (hexes held, +gained this week), weekly distance mini-chart, feed/recent activity, unread bell. Max 4 sections above the fold ordering by value.
- Workout / live recorder: map or dark canvas, GIANT distance, then time and pace; start, pause/resume, finish (hold-to-finish ~1 s with progress ring to avoid accidents); GPS quality chip; "waiting for signal" and low-storage states; screen stays readable in sunlight (high contrast). Controls in thumb zone.
- Run summary: hero "+N hexes" count-up, stat grid (distance, time, pace, captured/taken/lost), route on map, badges earned, share button; flagged/rejected runs explain why kindly and what to do.
- Map: full-bleed map, floating recenter + layers/legend chips, hex layers colour-coded, tap hex -> sheet (owner if allowed, since when, cooldown); zoom hint under zoom 15 ("Zoom in to see territory").
- Community: segmented (Leaderboard | Teams | Runners), period chips, rank rows with avatar, you-row pinned; team card with join code for members; feed items compact.
- Stats: period chips, simple SVG bar chart, records list, achievements grid with locked/unlocked states.
- Notifications: grouped by day, unread accent dot, swipe/tap to read, read-all in header.
- Profile (You): avatar, name, stats row, privacy summary, badges. Settings: grouped lists (Account, Privacy & data, App), destructive actions last and separated.

## Microcopy
Short, active, human, second person. Verbs on buttons ("Start run", "Save changes"). Errors: what happened + what to do ("Couldn't reach the server. Check your connection and try again."). No jargon (say "territory" or "area", not "H3 cell"), no blame, no exclamation spam, no emoji in system text. Units follow user setting; default km and min/km. Numbers localised, tabular.

## Accessibility
Contrast >= 4.5:1 text, 3:1 UI (check both themes); touch targets >= 44 px (48 for primary); every control has an accessible name; logical focus order; visible focus ring; dialogs/sheets trap and restore focus; `prefers-reduced-motion` honoured (06); never rely on colour alone; dynamic text up to 1.3x without clipping; screen-reader announcements for sync/GPS state changes.

## Anti-patterns (reject in review)
Mock or sample data; dead buttons; neon glow, stacked gradients, glassmorphism everywhere (backdrop-filter only on tab bar/sheets, with solid fallback); more than one primary button; text under 12 px; placeholder-as-label; spinners where skeletons fit; modal for non-destructive tasks; hard-coded colours/px outside tokens; screens that need the manual to understand; layouts that break at 360 px or in light theme.

## Definition of done for any UI work
Both themes, 360 and 412 px widths, font scale 1.3, all states, reduced motion, tests updated, lint + build green, docs updated (this file and mobile/src/ui/README.md).
