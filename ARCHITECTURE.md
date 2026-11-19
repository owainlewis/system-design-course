# Architecture

A static site. No framework, no server, no database.

```
course.json            parts and lessons, in teaching order (drives the sidebar)
lessons/<slug>.json    one lesson: sections, figures, references
src/template.html      the page shell; build.mjs fills it per lesson
src/body.html          top bar, sidebar, article, signup
src/page.css           all styles, light and dark
src/app.js             builds the page from the lesson JSON, the sidebar, controls, the animation loop,
                       drawing helpers, and the rate limiter figure kind
src/sim.js             the rate limiter simulation
src/kinds/flow.js      sequence diagrams (DNS lookups, handshakes)
src/kinds/lb.js        load balancer simulation and drawing
src/kinds/ring.js      hash mod N and consistent hashing
src/fonts/             self-hosted IBM Plex Sans, IBM Plex Mono, Source Serif 4 (OFL)
scripts/build.mjs      writes dist/<slug>/index.html for every lesson file, plus _redirects and _headers
scripts/check.mjs      content rules from docs/style-guide.md; the build fails on a broken rule
test/                  asserts the numbers each figure is meant to show
```

## Figures

Each figure in a lesson has a `kind` (default `ratelimit`). A kind registers itself in `KINDS` with
`period(f)`, `draw(f, wantStats)` and optional `init`, `change` and `action`. Drawing is a pure function
of the figure's clock `f.t`, so a figure can be paused, replayed or shown as a still.

Simulations are deterministic (seeded random numbers), so tests and the page see the same numbers.

## Adding a lesson

1. Add its slug to `course.json` if it is not there.
2. Write `lessons/<slug>.json`, following `docs/style-guide.md`.
3. Reuse a figure kind, or add one in `src/kinds/`.
4. Add tests for what each figure must show.
5. `npm test && npm run build`, then check the page in a browser.
