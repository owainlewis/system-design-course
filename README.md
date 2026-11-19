# System Design, Visually

A free course on system design with interactive diagrams. Deployed as a static site at system-design.aiengineer.co.

## How it fits together

- `course.json` lists every part and lesson in teaching order. It drives the sidebar.
- `lessons/<slug>.json` is one lesson: its sections, figures (each a simulation scene) and references. A lesson appears on the site once its file exists.
- `src/` holds the page: `page.css`, `sim.js` (the simulations), `app.js` (renders lessons and draws diagrams), `template.html`, `body.html` and self-hosted fonts.
- `scripts/build.mjs` writes `dist/`, one `index.html` per lesson. `scripts/check.mjs` enforces the checkable parts of `docs/style-guide.md`; the build fails if a lesson breaks them.
- `test/` asserts the numbers each diagram is meant to show.

## Commands

```
npm test         simulation checks
npm run build    build dist/
npm run dev      build and serve locally
```

## Deploy

Cloudflare Pages, connected to this repo. Build command `npm test && npm run build`, output directory `dist`. Custom domain `system-design.aiengineer.co`.
