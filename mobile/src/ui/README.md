# Territory Run UI foundation

Android / React / Capacitor. The auth controller, encrypted vault and API client
stay authoritative; this library adds no endpoints, permissions, recording
features or schema. Design intent lives in `docs/ai/05-ui-ux-design.md` and
motion/performance in `docs/ai/06-animation-and-performance.md`; this file
records what the code actually does. Component upgrades are tracked as T02-T03
in `docs/ai/08-tasks.md`.

## Tokens ("Clay & Pine")

All tokens are declared once in `src/styles.css` (`:root`, dark default; light
via `:root[data-theme="light"]` overrides of the same names). Components in `ui.css`
only read them; never hardcode colour or spacing in a component.

| Group | Tokens |
| --- | --- |
| Surface | `--bg` #12110F / #F3EEE4, `--surface-raised-2` (cards) #1A1816 / #FBF8F1, `--surface-raised` (sheets) #22201D / #FFFFFF, `--line`, `--line-strong`, `--fill-1..5`, `--scrim` |
| Ink | `--text`, `--text-2`, `--text-3` (warm off-white / charcoal) |
| Accent | pine `--accent` #6FB59A / #1F5A46, `--accent-bright`, `--accent-dim`, `--accent-ring`, `--on-accent`. Only the primary action, active tab, key live metrics and "my territory" |
| Signal | ochre `--warn`; clay `--danger`, `--danger-text`, `--danger-dim` |
| Map | `--map-mine` (pine), `--map-other` (slate), `--map-cooldown` (ochre), `--map-restricted` (clay), `--map-me-dot`, `--map-bg`; JS reads them through `mapColor()` in `src/map/hexes.js` |
| Media | `--media-*`, `--on-media*`; `.theme-media` (and the welcome shell) re-declare the dark token set so splash/welcome stay dark and legible in light theme |
| Spacing | `--sp-1..12` on a 4 px grid (4, 8, 12, 16, 20, 24, 32, 40, 48) |
| Radius | `--r-sm` 12, `--r-control` 14 (buttons, inputs), `--r-md` 16, `--r-lg` 22 (cards, sections), `--r-xl` 28 (hero cards, sheets), `--r-pill` (chips, segmented, tab indicator) |
| Layout | `--gutter` 20 (16 under 350 px), `--header-h` 56, `--focus` (ochre, one focus ring everywhere) |
| Type | `--fs-large-title` 36 (page h1), `--fs-display/title/headline/body/small/caption` with `--lh-*` (48, 28, 20, 16, 14, 12 px), `--fs-button` 17 |
| Motion | `motion.css`: `--motion-*` durations, `--ease-standard/enter/exit` |

Flat fills only: no gradients, glow or neon; elevation comes from borders and
surface tint, with shadow only on sheets, dialogs and toasts. Semantic colour is
always paired with an icon or text. Google's sign-in button keeps Google's own
white theme (`--google-*`), unaltered G and Google Sans label subset
(`src/assets/google/`).

Run `npm run check:contrast` after changing any colour: it checks text pairs at
4.5:1 and map/UI pairs at 3:1 on both themes.

## Typography

Barlow (400, 600; body) and Barlow Condensed (600, 700; headings and big stat
numbers), bundled from `@fontsource` in `src/main.jsx`, latin subset, only the
weights used. There is no runtime font request; system fonts are the fallback.
Use `font-variant-numeric: tabular-nums` for numbers. Never go below 12 px
(`--fs-caption`); layouts must survive OS font scale 1.3.

Hierarchy: page `h1` is a Condensed 700 large title; the header bar title stays
hidden until the h1 scrolls away (always shown on the map, never on tab roots).
`h2` is Barlow 600 20/24, labels and section titles are Barlow 600 14/20.
Sentence case everywhere: no uppercase tracked eyebrows or labels. Hero figures
(Home hexes held, live distance, "+N hexes") use Condensed 700 at display size.

## Components and states

Import from `./index.jsx`; mount UIProvider once above the app shell. Native
back calls closeTopOverlay before navigating or exiting. Decorative SVGs are
hidden from accessibility; every icon-only control has a text name.

| Component | Example | States / contract |
| --- | --- | --- |
| Button | `<Button onClick={save}>Save</Button>` | primary (default), secondary, ghost (alias quiet), destructive; `size="sm"` (44 px), `block`; disabled (+ `reason` text), loading keeps width; `type="submit"`; `to` for links |
| TextField | `<TextField label="Email" name="email" type="email"/>` | label, help, inline error (`error` prop, or `validate(value)` on blur), `clearable` 44 px clear button, focus, password eye, live new-password length hint; native uncontrolled values; reset restores masking |
| Switch | `<Switch label="Share route shapes" name="shareRouteShapes"/>` | native checkbox with switch role; checked, unchecked, focus, disabled; works with FormData |
| Segmented | `<Segmented label="Period" options={['Week','Month']} value={v} onChange={set}/>` | single choice on a fill track; selected = raised surface + hairline; 40 px buttons in a 48 px track. Also styles `role=tablist` buttons via `aria-selected` (Stats tabs) |
| Card | `<Card onClick={open}>…</Card>` | raised surface, r-lg, 16 px padding; `to`/`onClick` makes it a pressable link/button |
| StatGrid / StatTile | `<StatGrid><StatTile label="Distance" value="5.2" unit="km" delta="+0.4" tone="accent"/></StatGrid>` | caption label, tabular number, unit, delta chip; one column under 340 px |
| Banner | `<Banner tone="offline" action="Retry" onAction={r}>…</Banner>` | sticky calm strip; tones info/offline/syncing/warn/error (error = alert) |
| Chip | `<Chip selected>Clay</Chip>` | pressed selection (accent-dim + check), focus, disabled; pill, 44 px high. Wrap filter groups in `.chip-row` (edge-to-edge horizontal scroll; wraps inside sections/sheets) |
| ListRow | `<ListRow to="/you/privacy" label="Privacy" subtitle="…" value="Only me"/>` | 56 px+, link/button, `icon`/`leading` node, `subtitle`, `value`/`trailing`, chevron unless `chevron={false}` |
| Section | `<Section title="Account">rows</Section>` / `<Section plain title="This week" aside="4 km">…</Section>` | default: small label above a raised list surface, rows bleed to the edge with inset dividers. `plain`: headline title, no surface, for content blocks (charts, feeds, badge grids). `aside`: short text right of the title |
| Sheet | `<Sheet title="Choose your hex" onClose={close}>…</Sheet>` | scrim, 220ms entrance, close button, Escape/system back, focus trap/restore; grabber with drag-to-dismiss (transform only, closes past 96 px), max 85% height |
| Dialog | `<Dialog title="Discard?" onClose={close}>…</Dialog>` | accessible title and modal role; explicit destructive confirmation; same focus/back rules |
| Toast | `<Success>Profile saved.</Success>` | one app-level message, replacement rather than stacking, dismiss, 4s lifetime; no success banner |
| InlineNotice | `<InlineNotice error action="Retry" onAction={retry}>Offline.</InlineNotice>` | one compact message, optional action/dismiss; wraps important text instead of truncating; no thick border |
| Skeleton | `<Skeleton shape="row" lines={3} label="Loading…"/>` | shapes lines/row/card/stat (tile grid) matching the final layout; opacity-only shimmer, static under reduced motion; accessible label |
| EmptyState | `<EmptyState title="Room to run">…</EmptyState>` | what + why + optional action (secondary unless it is the screen's only action); `compact` drops the hex and the card for use inside a hero or section |
| ErrorState | `<ErrorState title="Stats unavailable" onRetry={reload}>Cannot connect.</ErrorState>` | optional title, plain failure, Retry when `onRetry` given; existing screens retain “Try again” wording |
| Avatar | `<Avatar id={2} color="#1F5A46"/>` | generated hex, decorative; picker buttons provide the name and pressed state |
| Screen | `<Screen title="Privacy" onBack={back} bottom={tabs}>…</Screen>` | fixed header, own scroll area, scroll hairline, safe insets, optional bottom content |
| TabBar | `<TabBar tabs={TABS} active="/you"/>` | five labelled 60 px destinations; active = pine icon on an accent-dim pill + full-ink label; unread count on Home; blurred only where `backdrop-filter` exists |
| RunStats | `<RunStats distance time pace variant="compact"/>` | live: giant high-contrast distance then time/pace; compact: three columns on a card (summary, detail) |
| Icon | `<Icon name="back"/>` | back, chevron, close, check, eye, eye-off, settings, home, user, warning; own code SVGs |

Motion tokens and keyframes live in `motion.css` (press 100, standard 200,
screen 300, sheet 300 ms; standard `(.2,0,0,1)`, enter `(.05,.7,.1,1)`, exit
`(.3,0,.8,.15)`). Press = fill change + .97 scale; forward/back content moves
12 px over 200 ms; tab switches crossfade (150 ms); dialogs scale from .96;
claim tiles rise with a 60 ms stagger; the hold-to-finish ring fills in 1 s.
Nothing loops except skeleton shimmer and the busy spinner. Under
`prefers-reduced-motion` all animation, transition and press scaling are removed.

## Platform and state ownership

- Core SystemBars, not @capacitor/status-bar, owns system/IME window insets.
  `viewport-fit=cover` and its matching startup hint prevent the clipped header.
  CSS uses the injected safe variable OR env() fallback, never their sum.
  Older WebViews receive native padding and zero CSS insets from Capacitor.
- Transparent status/navigation bars and dark icons on API26+, without a
  navigation contrast scrim. Explicit AndroidX bar styles avoid its default
  API26–28 scrim. API24–25 cannot display dark navigation icons, so those
  versions retain a deep-pine system navigation background for white icons.
  The tab bar background extends under the navigation area; only its controls
  are inset. Sheets also consume bottom/cutout insets. No double keyboard resize:
  Keyboard.resizeOnFullScreen and manual keyboard-height subtraction are absent.
- The approved light theme, force-dark opt-out and portrait lock live in the
  native app. Existing debug-only mixed-content support and all permissions stay.
- Keyboard events reveal focused fields. Content scrolls independently; the form
  submit stays sticky while typing. Editor action footers stick as a whole,
  keeping Bio’s Done button inside the resized viewport. Inputs and explicitly copyable values remain
  selectable; chrome has no selection/callout/tap highlight, zoom or overscroll.
- Safe signed-in pages cache only in process memory. Scroll and unsaved profile
  choices survive tab/back navigation; cache clears on account change/logout.
  Password/delete forms and action-token screens are not cached. Native back
  closes a modal first, pops a nested route, and exits at a tab root. Cold links
  use the parent route instead of looping through old protected history.
- Success is one toast. Landing errors have one slot above the actions. A clean
  login has no saved-data banner. PendingNotice reads actual encrypted counts,
  is dismissible, explains recovery, and offers Retry on read failure. New
  recording sources must implement countAll() as well as the per-owner count()
  if they retain unsent data while signed out; the encrypted journal does both.
- API requests retain the existing 15s bound, single-flight refresh and replay
  guards. Loading uses skeletons; failures keep entered values and offer retry.
  No controller, token store, Google adapter or authorization layer is duplicated.

## Checks

From `mobile/`: `npm test`, `npm run lint`, `npm run build`, `npm run check:bundle`,
`npm run check:contrast`. Native assets: `npm run assets:generate` / `assets:check`.
Device checks and before/after performance are recorded in `mobile/README.md`.

Motion helpers (`motion.jsx`): `CountUp`/`useCountUp` (hero values only), `HoldButton` (hold-to-finish ring, `onComplete`), `.stagger` (set `--i` per child) and `.pop-in` classes.
