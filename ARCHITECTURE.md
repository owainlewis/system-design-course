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
src/kinds/             one file per figure kind, loaded on every page in alphabetical order:
  bars.js              horizontal bars, log or linear (latency numbers, percentiles, nines)
  cache.js             cache simulation: hit ratio, eviction policies, TTLs, stale reads, stampedes
  calc.js              worked estimates: sliders in, formulas with the numbers filled in out
  flow.js              sequence diagrams (lookups, handshakes, retries, protocols)
  index.js             full table scan against a B-tree lookup
  lb.js                load balancer simulation: algorithms, slow servers, health checks
  queue.js             producer, bounded or unbounded queue, consumers: bursts, backpressure, shedding
  ring.js              hash mod N and consistent hashing
  shards.js            writes split by key range or hash, with growing or hot keys
  timeline.js          waterfalls of spans over time (request paths, traces, retries)
  topic.js             a broker handing out messages: queue, pub/sub, or a partitioned log
  vectors.js           nearest-neighbour search in 2D: exact against IVF clusters
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

A lesson in `course.json` with no `lessons/<slug>.json` file shows as "Soon" in the sidebar.

## Adding a lesson

1. Add its slug to `course.json` if it is not there.
2. Write `lessons/<slug>.json`, following `docs/style-guide.md`.
3. Reuse a figure kind, or add one in `src/kinds/`.
4. Add tests for what each figure must show.
5. `npm test && npm run build`, then check the page in a browser.
