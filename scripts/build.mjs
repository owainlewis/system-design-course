// Builds the site: one static page per lesson file, plus a course home page.
// Usage: node scripts/build.mjs            -> dist/, clean URLs (/dns/)
//        node scripts/build.mjs --flat DIR -> DIR/, flat files (dns.html) with relative links, for previews
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { checkLesson } from './check.mjs';

const root = new URL('..', import.meta.url).pathname;
const flatAt = process.argv.indexOf('--flat'), flat = flatAt > -1;
const out = flat ? process.argv[flatAt + 1].replace(/\/?$/, '/') : root + 'dist/';
const read = p => readFileSync(root + p, 'utf8');
const course = JSON.parse(read('course.json'));
const known = new Set(course.parts.flatMap(p => p.lessons.map(l => l[0])));
const slugs = readdirSync(root + 'lessons').filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));

const errors = [];
const lessons = slugs.map(slug => {
  const lesson = JSON.parse(read(`lessons/${slug}.json`));
  if (lesson.slug !== slug) errors.push(`${slug}: slug field is "${lesson.slug}"`);
  if (!known.has(slug)) errors.push(`${slug}: not listed in course.json`);
  errors.push(...checkLesson(lesson).map(e => `${slug}: ${e}`));
  return lesson;
}).filter(l => !l.draft);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

course.ready = lessons.map(l => l.slug);
const bySlug = Object.fromEntries(lessons.map(l => [l.slug, l]));
const kinds = readdirSync(root + 'src/kinds').filter(f => f.endsWith('.js')).sort();
const scripts = ['sim.js', 'app.js', ...kinds.map(k => 'kinds/' + k)];
const hash = createHash('sha256').update(['src/page.css', ...scripts.map(s => 'src/' + s)].map(read).join('')).digest('hex').slice(0, 10);
const template = read('src/template.html'), body = read('src/body.html');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');
const assets = flat ? 'assets/' : '/assets/';
const href = slug => flat ? `${slug}.html` : `/${slug}/`;
const page = (o) => template.replaceAll('{{title}}', esc(o.title)).replaceAll('{{summary}}', esc(o.summary)).replaceAll('{{path}}', o.path)
  .replace('{{flat}}', flat ? ' data-flat' : '').replaceAll('{{assets}}', assets)
  .replace('{{scripts}}', o.scripts ? scripts.map(s => `<script src="${assets}${s}?v=${hash}"></script>`).join('\n') : '')
  .replaceAll('{{hash}}', hash).replaceAll('{{body}}', o.body).replaceAll('{{course}}', json(course)).replaceAll('{{lesson}}', json(o.lesson ?? {}));

rmSync(out, { recursive: true, force: true });
mkdirSync(out + 'assets/kinds', { recursive: true });
for (const f of ['page.css', ...scripts]) cpSync(root + 'src/' + f, out + 'assets/' + f);
cpSync(root + 'src/fonts', out + 'assets/fonts', { recursive: true });

for (const l of lessons) {
  // The title, heading and summary are in the HTML, so the page makes sense before the script runs.
  const lessonBody = body.replace('<h1 id="title"></h1>', `<h1 id="title">${esc(l.title)}</h1>`).replace('<p class="dek col" id="dek"></p>', `<p class="dek col" id="dek">${esc(l.summary)}</p>`);
  const html = page({ title: l.title, summary: l.summary, path: `${l.slug}/`, body: lessonBody, lesson: l, scripts: true });
  if (flat) writeFileSync(out + `${l.slug}.html`, html);
  else { mkdirSync(out + l.slug, { recursive: true }); writeFileSync(out + `${l.slug}/index.html`, html); }
}

// Course home page: interactive hero preview + structured syllabus.
let n = 0;
const total = course.parts.reduce((a, p) => a + p.lessons.length, 0);
const totalDiagrams = lessons.reduce((a, l) => a + Object.keys(l.figures || {}).length, 0);
const totalMinutes = lessons.reduce((a, l) => a + (l.minutes || 0), 0);
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const BRAND_SVG = '<svg class="brand-mark" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.75" y="6.25" width="4.5" height="5.5" rx="1.2"/><rect x="11.75" y="1.75" width="4.5" height="5.5" rx="1.2"/><rect x="11.75" y="10.75" width="4.5" height="5.5" rx="1.2"/><path d="M6.25 9h2.25c1 0 1.25-4.5 3.25-4.5M8.5 9c1 0 1.25 4.5 3.25 4.5"/></svg>';
const CHK_SVG = '<svg class="l-done" width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Visited"><path d="M3 7.4 5.7 10 11 4.2"/></svg>';
const GH_SVG = '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>';

const homeSpec = {
  home: true,
  clients: bySlug['rate-limiting']?.clients || {},
  heroDemos: {
    ring: {
      tab: 'Consistent hashing',
      slug: 'consistent-hashing',
      caption: 'Adding a fifth server on a hash ring moves only the keys it takes over.',
      def: bySlug['consistent-hashing'].figures.ring
    },
    token: {
      tab: 'Rate limiting',
      slug: 'rate-limiting',
      caption: 'A token bucket absorbs a burst up to capacity, then enforces the refill rate.',
      def: bySlug['rate-limiting'].figures['token-bucket']
    },
    vectors: {
      tab: 'Vector search',
      slug: 'vector-search',
      caption: 'IVF probes the nearest Voronoi cluster, trading a little recall for speed.',
      def: { ...bySlug['vector-search'].figures.search, ctrl: { scenario: 'ivf1' } }
    }
  }
};

const homeBody = `<header class="bar">
  <a class="brand" href="${flat ? 'index.html' : '/'}">${BRAND_SVG}<strong>${esc(course.title)}</strong><span>${lessons.length} lessons, ${total - lessons.length} coming</span></a>
  <span class="sp"></span>
  <button class="theme-btn" id="theme-toggle" type="button" aria-label="Toggle color theme" title="Toggle light/dark theme"></button>
  <a class="sub" href="https://www.skool.com/aiengineer">Learn AI Engineering</a>
</header>
<main class="home-wrap">
  <section class="hero" aria-label="Course introduction">
    <div>
      <h1>${esc(course.title)}</h1>
      <p class="dek">A free course on how large systems work. Each lesson explains one idea in plain words, with deterministic simulations you can run, pause, scrub and change.</p>
      <ul class="hero-stats">
        <li><strong>${lessons.length}</strong> lessons</li>
        <li><strong>${totalDiagrams}</strong> live simulations</li>
        <li><strong>${course.parts.length}</strong> parts</li>
        <li><strong>~${Math.round(totalMinutes / 60)}h</strong> read time</li>
      </ul>
      <div class="hero-cta">
        <a class="start" href="${href(course.parts[0].lessons[0][0])}">Start with lesson 1: ${esc(course.parts[0].lessons[0][1])} <span aria-hidden="true">→</span></a>
        <a class="hero-secondary" href="#syllabus">Browse syllabus</a>
      </div>
      <div class="hero-note">
        <p>I made these notes for my own personal study, and I hope they're useful. If you spot any mistakes or want to contribute, feel free to open an issue or PR:</p>
        <a class="gh-badge" href="https://github.com/owainlewis/system-design-course" target="_blank" rel="noopener">${GH_SVG}<span>owainlewis/system-design-course</span></a>
      </div>
    </div>
    <div class="hero-stage" id="hero-stage"></div>
  </section>
  <div class="syllabus-bar" id="syllabus">
    <nav class="part-pills" aria-label="Course parts">
      ${course.parts.map(p => `<a href="#part-${slugify(p.title)}">${esc(p.title)}</a>`).join('')}
    </nav>
    <div class="home-find">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
      <input id="home-find" type="search" placeholder="Filter lessons..." aria-label="Filter lessons">
    </div>
  </div>
  ${course.parts.map(p => {
    const readyInPart = p.lessons.filter(([s]) => bySlug[s]);
    const minsInPart = readyInPart.reduce((a, [s]) => a + (bySlug[s].minutes || 0), 0);
    return `<section class="home-part" id="part-${slugify(p.title)}" data-part="${esc(p.title)}">
    <div class="home-part-head">
      <h2>${esc(p.title)}</h2>
      <p>${readyInPart.length} of ${p.lessons.length} ready${minsInPart ? ` · ${minsInPart} min` : ''}</p>
    </div>
    <ol class="home-list">${p.lessons.map(([slug, title]) => {
      n++; const l = bySlug[slug];
      const fCount = l ? Object.keys(l.figures || {}).length : 0;
      const q = `${title} ${l ? l.summary : ''}`.toLowerCase();
      return `<li class="${l ? 'ready' : 'soon-item'}" data-slug="${esc(slug)}" data-q="${esc(q)}"><i>${String(n).padStart(2, '0')}</i>${l
        ? `<div class="l-body"><a href="${href(slug)}">${esc(title)}</a><p>${esc(l.summary)}</p></div><div class="l-meta">${CHK_SVG}${fCount ? `<span class="l-figs">${fCount} ${fCount === 1 ? 'sim' : 'sims'}</span>` : ''}<span>${l.minutes} min</span></div>`
        : `<span class="t">${esc(title)}</span><div class="l-meta"><span>Soon</span></div>`}</li>`;
    }).join('')}</ol>
  </section>`;
  }).join('')}
  <p class="home-empty" id="home-empty" hidden>No lessons match your filter.</p>
  <footer>
    <span>${esc(course.title)}</span>
    <span class="foot-sep">·</span>
    <span>Open-source personal study notes</span>
    <span class="foot-sep">·</span>
    <a href="https://github.com/owainlewis/system-design-course" target="_blank" rel="noopener">GitHub</a>
  </footer>
</main>`;

writeFileSync(out + 'index.html', page({ title: course.title, summary: 'A free course on how large systems work, with interactive diagrams.', path: '', body: homeBody, lesson: homeSpec, scripts: true }).replace(`${esc(course.title)} · ${esc(course.title)}`, esc(course.title)));
if (!flat) writeFileSync(out + '_headers', `/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
console.log(`Built ${lessons.length} lesson(s) and the home page into ${out}`);
