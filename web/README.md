# Territory Run landing page — Phase 3

Work in `/Users/akshwagle/Desktop/Territory-Running-App`, on `feat/web-landing-page`. Phase 3 changes the website and the existing single phase-status line in the root AGENTS.md. Its eight ordered commits exclude the separate, uncommitted Phase 4 auth work under server/ and docs/. Phase 3 does not change the API, Android code or database. The page has no accounts, forms, analytics or running features.

## Run and verify

Configure the ignored `.env.local` from `.env.example`. `VITE_API_URL` is the API's HTTP(S) origin; it contains no secrets. See the root README for the existing API and PostgreSQL commands. From the repository root:

```sh
npm ci --prefix web
npm run dev --prefix web
npm test --prefix web
npm run lint --prefix web
npm run build --prefix web
```

Stop the dev server before serving the production build on its port:

```sh
npm run preview --prefix web -- --port 5173 --strictPort
```

The final local verification used this process-only override because the saved LAN API address was unreachable; the API responded on loopback. No env file was changed:

```sh
VITE_API_URL=http://127.0.0.1:4000 npm run build --prefix web
```

The existing IPv4 dev server was left running. A separate temporary IPv6 production listener used the already-allowed `http://localhost:5173` origin for headless checks; it was stopped afterwards. Neither the API's CORS configuration nor any user server was changed.

## Content and release behavior

The footer contains the brand, © 2026 Territory Run, the latest download and in-page navigation. Page copy describes the product and its current limitations; external navigation, redundant taglines and filler have been removed. The roadmap still labels all five planned features as In development. The version chip, release date, release notes, install instructions and Play Protect explanation remain.

One shared fetch drives every download placement. A ten-second AbortController deadline becomes the plain retryable error. Repeated Retry actions cannot start concurrent requests, and unmount aborts the active request. Loading uses flat paper-2 placeholders with reserved heights; header controls, metadata, the release card and footer retain stable geometry as the release arrives. Unsafe APK paths or invalid checksums never become download links.

Copy changes to Copied for two seconds, with a polite live announcement. On Clipboard API failure, all 64 checksum characters are selected and Press Ctrl/Cmd+C is announced. Feedback space and label widths are reserved. File size is shown only when a positive integer `fileSizeBytes` is provided; the current API supplies none. Android API 24 is the current Android build's minimum.

Skip to content is the first keyboard stop and focuses the main landmark. In-page navigation scrolls smoothly with a 96px anchor margin; reduced motion uses instant scrolling. The install instructions use an ordered list. Having trouble opens the warning question and scrolls it below the sticky header. FAQ uses native details with CSS plus/minus indicators and full-width summary targets.

## Theme, assets and motion

The exact field-guide tokens are in `src/styles/tokens.css` under Tailwind v4's @theme. Graphics originate in SVG/CSS/code, with no stock imagery or icon library. Fonts are self-hosted Barlow Latin 400/600 and Barlow Condensed Latin 800, with font-display: swap. Only body 400 and heading 800 are preloaded. Small flex slots are reserved so the later 600 face does not move arrows or labels.

Open Graph and Twitter title/description/card tags are present. The plain 1200×630 social PNG contains the cluster logo on paper. Regenerate it without installing a rendering package:

```sh
node web/scripts/render-social-card.js
```

The image metadata uses the local site's `/social-card.png` path. No production hostname has been invented. The document also provides the SVG favicon, 512px brand PNG and a visible message when JavaScript is disabled.

The top bar stays visible and adds only a line-colour hairline after scrolling. Buttons have colour hover feedback, a 1px active press, disabled styles and a 2px pine focus ring with 2px offset. Roadmap hover changes the left border over 150ms on hover-capable devices.

The illustrative map advances six pine cells every 350ms. A rival arrives, then takes a cell through a 250ms opacity crossfade over the retained pine layer. Claimed cells remain filled until the loop resets. Off-screen and background-tab loops pause. Reduced motion shows the final frame without a timer.

Wider desktop sessions use LazyMotion, domAnimation and m components. Headline lines fade/rise once; section reveals occur once; the How hex outlines draw once over 600ms with stroke-dashoffset. Outline code is exported from the existing lazy effect chunk. Static SVG outlines provide the fallback. Phones and narrow desktop sessions retain the earlier headline/reveal cuts to meet the mobile JavaScript budget; phones never request the desktop effect chunk, including in landscape.

The Android bottom bar fades/slides 8px over 200ms after the hero control passes the header. It exits before Install and remains hidden beyond it. Scroll-frame geometry checks handle fast anchor jumps. While the bar is mounted, the page reserves 80px plus the safe-area inset so it cannot cover the footer. Inactive exiting controls are inert. Reduced motion removes all transitions, presses, drawing and loop movement.

Clay on paper-2 measures 4.15:1, so small development labels retain a paper backing for 4.63:1. Other measured text ratios: muted/paper 5.65:1, muted/paper-2 5.07:1, pine/paper 6.96:1, ink/paper 13.63:1 and paper/pine-deep 11.00:1. Focus rings on dark bands have a flat paper backing.

## Installed versions

No packages were installed during the final pass. The existing application dependencies and lockfile remain pinned:

| Package | Exact version | Previously checked peer range |
| --- | --- | --- |
| tailwindcss | 4.3.5 | No declared peers |
| @tailwindcss/vite | 4.3.5 | Vite ^5.2.0 or ^6 or ^7 or ^8; accepts 8.3.8 |
| motion | 12.23.24 | React/React DOM ^18 or ^19; accepts 19.3.1 |
| @fontsource/barlow | 5.3.0 | No declared peers |
| @fontsource/barlow-condensed | 5.3.0 | No declared peers |

Motion's scoped transitive pins are framer-motion 12.23.24, motion-dom 12.23.23 and motion-utils 12.23.6. Its optional emotion peer is not needed. Vite and React were not downgraded. The ignored, already-installed Playwright tool was reused for verification; it is not an application dependency.

## Verification record — 11 November 2026

The current test/build logs, measured gzip totals and mobile trace results are stored in ignored `.local/phase3/`. Fresh screenshots use the `final-` prefix in ignored `.local/screenshots/`. These are verification outputs, not source files to commit.

The checks cover all four release states, Retry recovery and single-request behavior, copy feedback and selection fallback, first keyboard focus, the product footer, metadata/noscript, optional file size, sticky boundaries and anchor jumps. Headless production views at 320×800, 360×800, 768×1024 and 1280×800 have no horizontal overflow and have targets at least 48×48px. Delayed-release checks compare loading/available positions and heights at all four widths. Native reduced motion is checked for static headings, static SVG outlines, no active animation and an unchanged map.

A cold mobile trace uses 360×800 with touch/Android settings, 150ms latency, 1.6Mbps download, 0.75Mbps upload and 4× CPU throttling against the production preview. Both a Playwright trace ZIP and Chrome timeline JSON are retained. Lighthouse CLI is unavailable, and the no-new-packages rule was respected. Performance, Accessibility and Best Practices category scores are therefore unscored; trace timings and CLS are reported directly rather than converted into invented scores.

The initial tiny label/font shift was corrected before the final measurement. Keyboard navigation, focus styles, contrast, native details behavior, copy fallback and page errors were checked separately. These checks do not constitute a Lighthouse Accessibility score or physical-device APK validation.

30 tests across six files pass. ESLint and the production build pass.

| Measured production output | Gzip bytes | Decimal kB |
| --- | ---: | ---: |
| Mobile JavaScript | 80,994 | 80.99 |
| Desktop-only effect chunk | 19,599 | 19.60 |
| Every JavaScript chunk combined | 100,593 | 100.59 |
| Every CSS file combined | 6,560 | 6.56 |

These are Node gzipSync measurements of the actual emitted files; Vite also prints its own compressor estimates. The production resource log confirms phones skip the desktop effect chunk. Build enforces 90,000 mobile JavaScript bytes and 15,000 CSS bytes.

| Final mobile trace observation | Result |
| --- | --- |
| CLS | 0 |
| FCP | 1.216 s |
| LCP | 1.216 s |
| Long tasks observed | 0 |
| JavaScript page errors | 0 |
| Lighthouse Performance / Accessibility / Best Practices | Unscored; trace fallback used |

The live release was version 0.1.1, code 2. Loading and empty states used temporary browser fixtures; error used a closed port and Retry recovered to the live API. Delayed-release checks found identical metadata/card/footer positions and sizes at all four widths. Copy fallback selected all 64 characters. Keyboard anchors landed 96px below the viewport top. Desktop outline offset changed from 1px to 0px; hover became pine and the takeover transition was 250ms. JavaScript-disabled mode displayed the exact noscript message.

Artifacts: `.local/phase3/final-tests.log`, `final-lint.log`, `final-build.log`, `final-browser-report.json`, `usability-report.json`, `mobile-performance.json`, `mobile-performance-trace.json` and `mobile-playwright-trace.zip`. The source content scan has zero retired page terms. Screenshots include `final-landing-{320x800,360x800,768x1024,1280x800}-full.png`, state/device captures and `final-mobile-performance-360.png`.


## Anti-AI self-check

1. Flat fills and hairlines only; no gradients, glows, blurred decoration or decorative shadows.
2. Original hex artwork, plain arrows and copy SVG; the requested FAQ plus/minus uses CSS, with no emoji or icon package.
3. Numbered editorial How rows, ruled roadmap and ordered install stepper; no identical feature-card grid.
4. Left-aligned hero and concrete product copy; no pill above the headline, invented proof or promotional filler.
5. Asymmetric 12-column layout, varied space, numbered labels and section rules.
6. Square or 2px corners; no pills or oversized card radii.
7. All art originates in code, including the social PNG; no photos, store badges or fabricated counts.
8. Hexes are restricted to the brand, hero illustration, How numbers and one divider.

The requested CSS disclosure indicator, button press, border transition and stroke drawing are deliberate final-brief additions. The earlier mobile effect cuts and accessible label backing remain documented accommodations. No other visual rule was intentionally bent.

## Commit verification — 12 November 2026

The first four commits were already on this branch. The remaining four follow the plan below, with normal Git timestamps and no date overrides. Each remaining commit was built from an isolated export of its Git index, so later uncommitted source files could not satisfy missing imports. All four builds pass. Final `npm test --prefix web`, `npm run lint --prefix web` and the production build pass: 30 tests across six files, clean ESLint, and the same measured gzip totals shown above (80,994 mobile JS bytes, 19,599 desktop-effect bytes, 100,593 combined JS bytes, 6,560 CSS bytes). The build used the process-only loopback API override documented above; no env file was changed.

The earlier browser and trace observations remain dated 11 November above; they were not rerun solely for committing. Lighthouse scores remain unscored. Phase 4 source, its two docs and its ignored file ledger are preserved unchanged and excluded from every Phase 3 commit. Only the existing AGENTS.md phase-status line is updated.

## Eight ordered Phase 3 commits

1. `chore(web): pin landing page tooling` — package.json dependency hunks, package-lock.json and the Tailwind Vite plugin wiring.
2. `style(web): add field guide theme and typography` — src/styles/tokens.css, src/styles.css, src/main.jsx font imports and public/barlow-OFL.txt / barlow-condensed-OFL.txt.
3. `feat(web): add brand and document metadata` — src/components/Logo.jsx / Icons.jsx, public/favicon.svg / logo-512.png / social-card.png, scripts/render-social-card.js and index.html, including font preloads and noscript.
4. `feat(web): preserve release and copy interactions` — src/hooks/useRelease.js / useDownloadVisibility.js and src/components/DownloadControl.jsx / ReleaseCard.jsx.
5. `feat(web): add visibility-aware motion` — src/components/TerritoryMap.jsx / Reveal.jsx, src/hooks/usePresentationMotion.js / useStickyPresence.js / useScrolled.js and src/motion-features.js.
6. `feat(web): build product landing page` — src/App.jsx and src/components/HowItWorks.jsx / Roadmap.jsx / InstallGuide.jsx / PhoneIllustration.jsx / FAQ.jsx, including footer and troubleshooting links.
7. `test(web): cover usability motion and transfer budgets` — src/App.test.jsx, src/test-setup.js, src/document.test.js, src/components/TerritoryMap.test.jsx / ReleaseCard.test.jsx, src/hooks/usePresentationMotion.test.js / useRelease.test.js, scripts/bundle-sizes.js and the package build-command / Vite manifest hunks.
8. `docs(web): record phase 3 checks and decisions` — this README, THIRD_PARTY_NOTICES.md and only the existing root AGENTS.md phase-status line.

The shared package/config changes were split between commits 1 and 7 as listed. Files were staged by explicit path only. Keep env files, dist, screenshots, traces, caches and test tooling ignored. Temporary index-export verification files are removed after use. This PR contains no Phase 4 work.
