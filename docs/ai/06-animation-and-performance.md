# Animation, feedback and performance

Rule: motion explains change and gives feedback; it never decorates or delays. Everything must hold 60 fps on a 4 GB mid-range Android. CSS only (transform and opacity). No animation libraries (no framer-motion, GSAP, Lottie) without owner approval.

## Tokens (mobile/src/ui/motion.css, extend there)
Easings: --ease-standard cubic-bezier(.2,0,0,1), --ease-enter cubic-bezier(.05,.7,.1,1), --ease-exit cubic-bezier(.3,0,.8,.15). Durations: micro 100-150 ms (press, toggle), standard 200-250 ms (fade, chip, tile), screen 250-300 ms, sheet 280-320 ms, celebration <= 1200 ms once. Nothing longer than 400 ms except celebrations. Exit faster than enter.

## Catalogue (what to build)
- Screen transitions: forward slide 12 px + fade, back reverse (existing screen-forward/back); tab switch = crossfade only, no slide.
- Press feedback: scale .97 + fill change on all tappable surfaces, 100 ms; no ripple libraries.
- Bottom sheet: translateY(100%) -> 0 with scrim fade; drag follows finger; spring-like settle via ease-enter.
- Lists: first-load stagger max 6 items x 30 ms; later updates no animation. Skeleton shimmer 1.2 s linear, opacity-only gradient on a pseudo element, paused when offscreen.
- Numbers: count-up for hero values (run result hexes, weekly distance) 600-800 ms with tabular nums; live run numbers update without animation (no jitter).
- Territory moments: claimed hexes fade in on the map (hex-fill 300 ms, staggered by distance up to 400 ms total); "+N hexes" pops with a small scale 0.9->1 and settles; lost-hex notice is calm (no alarm motion).
- Badge earned / personal best: one-shot celebration (icon scale + soft ring pulse, <= 1.2 s), shown once per event, skippable by tap, plus light haptic. No confetti libraries.
- Buttons: loading = inline spinner (CSS rotate) keeping width; success tick fades in 150 ms.
- Hold-to-finish control: conic progress ring fills in 1 s; releasing early reverses 150 ms.
- Offline/sync banner: slide down 200 ms, auto-hide after reconnect.
- Pull-to-refresh only where data refreshes server-side (Home, Community, History); native-feeling resistance, spinner under 400 ms feedback.

## Reduced motion
Under `prefers-reduced-motion: reduce`: remove translate/scale, keep opacity fades <= 150 ms, no count-up (show final value), no shimmer (static tint), no stagger.

## Haptics
`mobile/src/ui/haptics.js` exists and is a no-op until the VIBRATE permission is in the manifest (owner decision, see decision log). Use only for: run start/pause/finish, hold-to-finish completion, badge earned, destructive confirm. Never on scroll or taps in lists.

## Performance budgets
- Mobile main JS <= 100 kB gzip (was ~92 kB); each route chunk <= 40 kB gzip; Leaflet and h3-js load only on /map and run detail (lazy); CSS <= 30 kB gzip; fonts <= 80 kB total (bundled Barlow and Barlow Condensed, only used weights, latin subset).
- Cold start to interactive <= 2.5 s on mid-range Android; route transitions < 100 ms to first paint (skeleton first).
- Images: SVG or WebP, sized to display, `loading="lazy"` below the fold; avatars max 256 px; no layout shift (reserve space).
- Lists over 100 rows: paginate (cursor) or window; never render hundreds of DOM nodes.
- Animate only transform/opacity; avoid animating box-shadow, filter, backdrop-filter, width/height, top/left. `will-change` only during an active animation. backdrop-filter limited to tab bar and sheets with solid fallback.
- Network: batch requests, cache with short TTL (map boxes 30 s), debounce inputs 300-400 ms, no polling faster than 60 s (notifications), pause polling when app hidden, retry with backoff, show cached data first.
- Battery: GPS sampling adaptive (existing native recorder), no timers or listeners when screen hidden, stop map location watch off the map screen.
- React: memoise heavy list items, stable keys, no state in context that updates every second (isolate live run timer), split big components, avoid re-rendering the map on every GPS tick (throttle to 1 Hz).
- Measure before and after: record bundle sizes (`npm run build` output) in the task notes.
