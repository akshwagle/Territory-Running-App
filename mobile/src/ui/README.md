# Territory Run UI foundation

Android / React / Capacitor 8.6.0. One auth controller, encrypted vault and API
client remain authoritative. This library adds no endpoints, permissions,
recording features, schema or runtime framework. The three current destinations
are Home, You (profile → privacy → consent), and Settings (sign-in and data).
The tabs are the `TABS` configuration in Shell.jsx. Old profile/privacy URLs
redirect to You; no second profile icon or Settings shortcut duplicates the tabs.

## Tokens and typography

Colours mirror `web/src/styles/tokens.css` exactly: paper #F3EEE4, paper-2
#E9E2D3, line #D5CCB8, ink #1F2421, muted #5A5F58, pine #1F5A46,
pine-deep #14392C, clay #B8452A. No shared token changed.

| Scale | Values | Use |
| --- | --- | --- |
| Space | 4, 8, 12, 16, 20, 24, 32, 40, 48 px | 4px rhythm; platform insets are additional |
| Note / body / lead | .875 / 1 / 1.25 rem | Barlow 400/600 |
| Title / hero | 2.5 / 3.5 rem, fluid on phones | Barlow Condensed 800; uppercase except the landing headline |
| Targets | 48px minimum; primary buttons 52px | Heights may grow when labels wrap |
| Corners | 2px | No pills, gradients, shadows or glow |

OS font scaling is preserved. On the real phone at 320 CSS px, Android
font_scale=1.3 increased body text from 16 to 20.8 CSS px and field labels
from 14 to 18.2px. Non-Latin text
uses the system fallback. Names use automatic bidi direction; email/name values
wrap. This is English UI with bidi-safe content, not an RTL translation.

Only Google's button label uses Google Sans Medium. The official font is
Version 14.000;[08f2ac800], statically instantiated at 500 and subset with
preinstalled fontTools 4.62.1 to `Continue with Google` / `Opening Google…`.
The 4,132-byte WOFF and full SIL OFL 1.1 text are together in
`../assets/google/`. The exact pinned official source URL is recorded there in
THIRD_PARTY_NOTICES.md. The build also bundles its full licence with the
app in THIRD_PARTY_NOTICES.txt. No font package or external runtime font request is used.
The official multicolour G is unmodified; its supplied gradient is a Google
brand asset, while Territory Run's own artwork and surfaces use flat fills.
The button uses Google's white theme, #747775 stroke, #1F1F1F text, 20px G,
10px logo-to-label gap and at least 12px horizontal padding; it is 52px tall.

## Components and states

Import from `./index.jsx`; mount UIProvider once above the app shell. Native
back calls closeTopOverlay before navigating or exiting. Decorative SVGs are
hidden from accessibility; every icon-only control has a text name.

| Component | Example | States / contract |
| --- | --- | --- |
| Button | `<Button onClick={save}>Save</Button>` | primary (default), secondary, quiet, destructive; disabled, loading; `type="submit"` for form actions; `to` for links |
| TextField | `<TextField label="Email" name="email" type="email"/>` | label, help, inline error, focus, password eye, live new-password length hint; native uncontrolled values; reset restores masking |
| Switch | `<Switch label="Share route shapes" name="shareRouteShapes"/>` | native checkbox with switch role; checked, unchecked, focus, disabled; works with FormData |
| Chip | `<Chip selected>Clay</Chip>` | pressed selection, focus, disabled; not a rounded badge |
| ListRow | `<ListRow to="/you/privacy" label="Privacy" value="Only me"/>` | link/button, optional value/icon, chevron, immediate pressed colour |
| Section | `<Section title="Your data">…</Section>` | ruled, labelled group; no card grid |
| Sheet | `<Sheet title="Choose your hex" onClose={close}>…</Sheet>` | scrim, 220ms entrance, close button, Escape/system back, focus trap/restore; no drag gesture |
| Dialog | `<Dialog title="Discard?" onClose={close}>…</Dialog>` | accessible title and modal role; explicit destructive confirmation; same focus/back rules |
| Toast | `<Success>Profile saved.</Success>` | one app-level message, replacement rather than stacking, dismiss, 4s lifetime; no success banner |
| InlineNotice | `<InlineNotice error action="Retry" onAction={retry}>Offline.</InlineNotice>` | one compact message, optional action/dismiss; wraps important text instead of truncating; no thick border |
| Skeleton | `<Skeleton label="Loading profile…"/>` | flat paper-2 bars, accessible loading label, no shimmer or infinite spinner |
| EmptyState | `<EmptyState title="Room to run">…</EmptyState>` | purposeful empty hex, honest copy, optional relevant action |
| ErrorState | `<ErrorState onRetry={reload}>Cannot connect.</ErrorState>` | plain failure plus Retry; existing screens retain “Try again” wording |
| Avatar | `<Avatar id={2} color="#1F5A46"/>` | generated hex, decorative; picker buttons provide the name and pressed state |
| Screen | `<Screen title="Privacy" onBack={back} bottom={tabs}>…</Screen>` | fixed header, own scroll area, scroll hairline, safe insets, optional bottom content |
| TabBar | `<TabBar tabs={TABS} active="/you"/>` | three labelled 48px+ destinations; current filled indicator, persistent while scrolling |
| Icon | `<Icon name="back"/>` | back, chevron, close, check, eye, eye-off, settings, home, user, warning; own code SVGs |

Button press is an immediate colour change plus .98 scale over 90ms. All motion
values live in motion.css: 100/200/300ms; standard (.2,0,0,1), enter
(.05,.7,.1,1), exit (.3,0,.8,.15). Forward/back content moves 12px over 200ms;
tab switches hide the outgoing page immediately and fade only the incoming page
over 150ms; sheets enter over 220ms; loaded content fades over 150ms.
Reduced motion removes animations, transitions and press scaling. No haptics,
looping decoration, confetti, animated skeleton or layout-property animation.
Landing hex fills run once, roughly 1.2s, and then stay still.

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

## Design principles

These are lessons applied to Territory Run, not borrowed layouts or assets.

- [Pratt's Strava critique](https://ixd.prattsi.org/2026/02/design-critique-strava-ios-app-3/): clear destination ownership, relevant primary actions, explicit privacy. Profile/privacy live under You, without a duplicate header shortcut.
- [the5krunner](https://the5krunner.com/2025/07/16/strava-app-redesign/) and [BikeRadar](https://www.bikeradar.com/news/strava-redesigned-record-feature): stable map/metric placement informs later recording work. This step adds no map, recording button or invented statistics.
- [ScreensDesign onboarding](https://screensdesign.com/articles/fitness-app-onboarding-examples/) and [running screens](https://screensdesign.com/articles/running-app-screen-design-examples/): sparse hierarchy, one state-relevant action, understandable conservative privacy choices; no social or upsell prompts.
- [Android system bars](https://developer.android.com/design/ui/mobile/guides/foundations/system-bars) and [edge to edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge-manually): edge backgrounds, inset controls, persistent bottom navigation, native back and real-device checks.
- [Capacitor SystemBars](https://capacitorjs.com/docs/apis/system-bars) and [keyboard](https://capacitorjs.com/docs/apis/keyboard): use the installed core inset owner and avoid conflicting full-screen resize behavior.
- [Capgo's React/Capacitor guide](https://capgo.app/blog/create-react-mobile-apps-with-capacitor/): separate persistent chrome from scrolling content. No Capgo package or transition plugin was installed.
- [Appademics' transition article](https://medium.com/appademics-magazine/the-sneaky-secret-technique-mobile-apps-use-to-make-transitions-appear-smoother-than-they-really-d4081a812a21): prepare content before revealing it. Here bounded page caching and lazy modules provide continuity; no screenshots of private screens are stored by the app.
- [Google branding](https://developers.google.com/identity/branding-guidelines): official unaltered G, approved label and Google-only font exception.

## Website anti-AI checklist

1. Flat paper/pine/clay fills and hairlines; no Territory Run gradients/glow/blur/shadows.
2. Own SVG controls and territory geometry; no emoji or icon package.
3. Ruled account lists and sections; no identical feature-card grid.
4. Concrete copy and left-aligned hierarchy; no proof badges, pills or fake counts.
5. Deliberate spacing: brand hero, actions, forms and account lists have distinct roles.
6. Square/2px corners. The native Google account picker retains Android's own styling.
7. Own code art and supplied Google mark; no stock photos or fake store badges.
8. Hexes identify territory, brand, avatars, loading buttons and empty states; no wallpaper.

## Checks

From the repository root: `npm test --prefix mobile`, `npm run lint --prefix mobile`,
`npm run build --prefix mobile`, `npm run check:bundle --prefix mobile`.
Generate/verify native assets with `npm run assets:generate --prefix mobile` and
`npm run assets:check --prefix mobile`. Sharp 0.35.5 is a mobile devDependency only.
The generator covers all five densities, adaptive colour/monochrome, white
notification mask and paper splash, and removes only replaced Capacitor template art.
The first React paint releases the splash without waiting on network; exit is
instant, so reduced motion cannot inherit a launch animation.

Real command output, device checks, native file inventory and before/after
performance are recorded in mobile/README.md. Screenshots are ignored in
`.local/screenshots/`; UI-01 through UI-10 are tracked in docs/EDGE_CASES.md.

## Owner correction: fewer boxes

The owner found the first preview's always-open units/bio fields and full-width
Save actions too heavy. The corrected You screen is a profile overview: hex
avatar/identity, current values in short ruled rows, and focused editors on tap.
Units and visibility use labelled radio lists; name/bio editors open only when
needed. Closing/back preserves the in-memory draft, including native autofill
values read with FormData. A contained Save appears with “Unsaved changes”;
only that action writes to the existing API. Failure keeps the draft.

Other screens use lighter underlined fields with persistent labels and a strong
pine underline/label focus indicator. Secondary actions are quiet; destructive and primary actions retain
52px targets. Google's required button styling stays intact. No new package,
endpoint, preference or automatic-save behaviour was added.

This applies [Android settings patterns](https://developer.android.com/design/ui/mobile/guides/patterns/settings),
[Material's scannable lists](https://m3.material.io/components/lists/overview) and
[NN/G's progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
The trade-off is an extra tap to edit a preference; viewing the profile no longer
requires scanning a full form. Privacy reads also load concurrently.


## Owner correction: no overlapping tab content

A two-layer crossfade briefly showed Settings and You together. Only one route
is now paintable at a time: inactive cached pages are hidden, inert and excluded
from accessibility immediately. This intentionally replaces the brief's overlapping
crossfade with an incoming-only 150ms fade; reduced motion changes instantly.
Drafts and scroll positions still remain in memory. Focus goes only to the active
heading. Back takes precedence over a restored tab's old navigation state.

Regression checks stress rapid tabs before animations finish, active heading
focus, scroll/draft preservation, Back direction, and a release footer that stays
mounted instead of flashing its loading state. Page errors suppress a duplicate
global connection notice. The owner confirmed the corrected phone build has no
overlap after 72 device-tested switches recorded zero overlapping frames.
